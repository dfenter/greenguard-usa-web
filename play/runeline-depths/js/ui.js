/* Runeline Depths - UI kit.
 * Everything here obeys play/_assets/UI_LAW.md: one transient at a time,
 * corner chips rather than banners during play, centre banners only at run
 * boundaries, a thin fading coach strip, icons over labels, 44px minimum
 * touch targets, safe-area aware placement, and change-guarded text and
 * colour writes so the HUD never re-lays-out on an unchanged value.
 */
(function (root) {
  'use strict';

  var RD = root.RD || {}; root.RD = RD;
  var Art = RD.Art;

  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  RD.FONT = FONT;

  /* change guards */
  RD.setText = function (obj, str) {
    if (!obj) return;
    if (obj.__lastText !== str) { obj.__lastText = str; obj.setText(str); }
  };
  RD.setColor = function (obj, css) {
    if (!obj) return;
    if (obj.__lastColor !== css) { obj.__lastColor = css; obj.setColor(css); }
  };
  RD.setTint = function (obj, c) {
    if (!obj) return;
    if (obj.__lastTint !== c) { obj.__lastTint = c; obj.setTint(c); }
  };
  RD.setVis = function (obj, v) {
    if (!obj) return;
    if (obj.visible !== v) obj.setVisible(v);
  };

  RD.text = function (scene, x, y, str, size, color, weight, align) {
    var t = scene.add.text(x, y, str, {
      fontFamily: FONT,
      fontSize: size + 'px',
      fontStyle: String(weight || 600),
      color: color || '#E8EEF7',
      align: align || 'left'
    });
    t.__lastText = str;
    t.__lastColor = color;
    t.setResolution(Math.min(2, window.devicePixelRatio || 1));
    return t;
  };

  /* --------------------------------------------------------- bars */
  RD.Bar = function (scene, x, y, w, h, trackColor, fillColor) {
    this.track = scene.add.image(x, y, 'px-white').setOrigin(0, 0.5).setDisplaySize(w, h).setTint(trackColor);
    this.fill = scene.add.image(x + 1, y, 'px-white').setOrigin(0, 0.5).setDisplaySize(Math.max(1, w - 2), h - 2).setTint(fillColor);
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.value = 1;
  };
  RD.Bar.prototype.set = function (frac) {
    frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
    if (Math.abs(frac - this.value) < 0.0015) return;
    this.value = frac;
    this.fill.setDisplaySize(Math.max(0.5, (this.w - 2) * frac), this.h - 2);
    this.fill.setVisible(frac > 0.001);
  };
  RD.Bar.prototype.setColors = function (t, f) {
    RD.setTint(this.track, t);
    if (this.fill.__lastTint !== f) { this.fill.__lastTint = f; this.fill.setTint(f); }
  };
  RD.Bar.prototype.setDepth = function (d) { this.track.setDepth(d); this.fill.setDepth(d + 0.1); return this; };
  RD.Bar.prototype.move = function (x, y, w) {
    this.x = x; this.y = y; if (w != null) this.w = w;
    this.track.setPosition(x, y).setDisplaySize(this.w, this.h);
    this.fill.setPosition(x + 1, y).setDisplaySize(Math.max(0.5, (this.w - 2) * this.value), this.h - 2);
  };
  RD.Bar.prototype.destroy = function () { this.track.destroy(); this.fill.destroy(); };

  /* ------------------------------------------------------------ rings */
  /* Hand tessellated. Phaser Graphics.arc walks a sweep in 0.01 rad steps,
     which is hundreds of commands per frame at this size. */
  RD.Ring = function (scene, x, y, radius, thickness, color, segs) {
    this.g = scene.add.graphics();
    this.x = x; this.y = y; this.r = radius; this.t = thickness;
    this.color = color; this.segs = segs || 34;
    this.frac = -1; this.dirty = true;
  };
  RD.Ring.prototype.setDepth = function (d) { this.g.setDepth(d); return this; };
  RD.Ring.prototype.move = function (x, y, r) {
    if (x === this.x && y === this.y && (r == null || r === this.r)) return;
    this.x = x; this.y = y; if (r != null) this.r = r; this.dirty = true;
  };
  RD.Ring.prototype.setColor = function (c) {
    if (c === this.color) return;   /* same change guard as setText */
    this.color = c; this.dirty = true;
  };
  RD.Ring.prototype.set = function (frac) {
    frac = frac < 0 ? 0 : frac > 1 ? 1 : frac;
    if (!this.dirty && Math.abs(frac - this.frac) < 0.004) return;
    this.frac = frac; this.dirty = false;
    var g = this.g;
    g.clear();
    if (frac <= 0.001) return;
    var n = Math.max(2, Math.ceil(this.segs * frac));
    var a0 = -Math.PI / 2;
    var ro = this.r, ri = this.r - this.t;
    var pts = [];
    var i, a;
    for (i = 0; i <= n; i++) {
      a = a0 + (i / this.segs) * Math.PI * 2 * (frac * this.segs / n) * (n / this.segs);
      a = a0 + (i / n) * Math.PI * 2 * frac;
      pts.push(this.x + Math.cos(a) * ro, this.y + Math.sin(a) * ro);
    }
    for (i = n; i >= 0; i--) {
      a = a0 + (i / n) * Math.PI * 2 * frac;
      pts.push(this.x + Math.cos(a) * ri, this.y + Math.sin(a) * ri);
    }
    g.fillStyle(this.color, 1);
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fillPath();
  };
  RD.Ring.prototype.clear = function () { this.g.clear(); this.frac = -1; this.dirty = true; };
  RD.Ring.prototype.destroy = function () { this.g.destroy(); };

  /* ---------------------------------------------------------- buttons */
  /* Image plus label, minimum 44px hit area, press and release states. */
  RD.Button = function (scene, x, y, w, h, label, opts) {
    opts = opts || {};
    this.scene = scene;
    var key = 'ui-btn-' + (opts.bright ? 'b' : 'n') + '-' + Math.round(w) + 'x' + Math.round(h);
    if (!scene.textures.exists(key)) {
      Art.put(scene, key, Art.bakeButton(w, h, opts.tint == null ? 0x2A3A5C : opts.tint, opts.bright));
    }
    this.img = scene.add.image(x, y, key).setOrigin(0.5);
    this.label = RD.text(scene, x, y, label, opts.size || 16, opts.color || '#F2F6FF', 750).setOrigin(0.5);
    this.icon = null;
    if (opts.icon) {
      this.icon = scene.add.image(x - w / 2 + 20, y, 'icon-' + opts.icon).setDisplaySize(20, 20).setAlpha(0.9);
      this.label.setX(x + 10);
    }
    var hw = Math.max(w, 44), hh = Math.max(h, 44);
    this.img.setInteractive(new Phaser.Geom.Rectangle((w - hw) / 2, (h - hh) / 2, hw, hh), Phaser.Geom.Rectangle.Contains);
    this.enabled = true;
    var self = this;
    this.img.on('pointerdown', function () {
      if (!self.enabled) return;
      self.img.setScale(0.96);
      if (opts.onDown) opts.onDown();
    });
    this.img.on('pointerout', function () { self.img.setScale(1); });
    this.img.on('pointerup', function () {
      self.img.setScale(1);
      if (!self.enabled) return;
      if (opts.onUp) opts.onUp();
    });
    this.parts = [this.img, this.label];
    if (this.icon) this.parts.push(this.icon);
  };
  RD.Button.prototype.setDepth = function (d) {
    this.img.setDepth(d); this.label.setDepth(d + 0.1);
    if (this.icon) this.icon.setDepth(d + 0.1);
    return this;
  };
  RD.Button.prototype.setEnabled = function (v) {
    this.enabled = v;
    this.img.setAlpha(v ? 1 : 0.42);
    this.label.setAlpha(v ? 1 : 0.5);
    if (this.icon) this.icon.setAlpha(v ? 0.9 : 0.4);
    return this;
  };
  RD.Button.prototype.setLabel = function (s) { RD.setText(this.label, s); return this; };
  RD.Button.prototype.destroy = function () {
    this.parts.forEach(function (p) { p.destroy(); });
  };

  /* ------------------------------------------------- transient notices */
  /* One at a time. In-play events get a corner chip; centre banners are
     only allowed at run boundaries and are refused during live play. */
  RD.Notices = function (scene, kit) {
    this.scene = scene;
    this.kit = kit;
    this.queue = [];
    this.active = null;
    this.t = 0;

    this.chipBg = scene.add.image(0, 0, 'ui-chip').setOrigin(0, 0.5).setVisible(false).setDepth(200);
    this.chipIcon = scene.add.image(0, 0, 'icon-rune').setDisplaySize(18, 18).setVisible(false).setDepth(201);
    this.chipText = RD.text(scene, 0, 0, '', 15, '#F2F6FF', 750).setOrigin(0, 0.5).setVisible(false).setDepth(201);

    this.banBg = scene.add.image(0, 0, 'px-white').setOrigin(0.5).setVisible(false).setDepth(205).setTint(0x101A2E).setAlpha(0.94);
    this.banEdge = scene.add.image(0, 0, 'px-white').setOrigin(0.5).setVisible(false).setDepth(204).setTint(0xF7C948);
    this.banText = RD.text(scene, 0, 0, '', 26, '#FFF3D6', 800).setOrigin(0.5).setVisible(false).setDepth(206);
    this.banSub = RD.text(scene, 0, 0, '', 15, '#B9C6DC', 600).setOrigin(0.5).setVisible(false).setDepth(206);
  };

  RD.Notices.prototype.layout = function (L) { this.L = L; };

  /* corner chip: icon plus at most a short line, 1.0s hold */
  RD.Notices.prototype.chip = function (text, icon, tint) {
    this.push({ kind: 'chip', text: text, icon: icon || 'rune', tint: tint || 0xF7C948, hold: 1.0 });
  };
  /* run boundary banner: 60 percent width, overshoot in, reserved beat */
  RD.Notices.prototype.banner = function (text, sub, tint, hold) {
    this.push({ kind: 'banner', text: text, sub: sub || '', tint: tint || 0xF7C948, hold: hold == null ? 1.5 : hold });
  };
  RD.Notices.prototype.push = function (n) {
    if (this.queue.length > 4) this.queue.shift();
    this.queue.push(n);
  };
  RD.Notices.prototype.clear = function () {
    this.queue.length = 0;
    this.active = null;
    this.hideAll();
  };
  RD.Notices.prototype.hideAll = function () {
    RD.setVis(this.chipBg, false); RD.setVis(this.chipIcon, false); RD.setVis(this.chipText, false);
    RD.setVis(this.banBg, false); RD.setVis(this.banEdge, false);
    RD.setVis(this.banText, false); RD.setVis(this.banSub, false);
  };

  RD.Notices.prototype.update = function (dt) {
    if (!this.active) {
      if (!this.queue.length) return;
      this.active = this.queue.shift();
      this.t = 0;
      this.begin(this.active);
    }
    this.t += dt;
    var n = this.active;
    var inT = n.kind === 'banner' ? 0.28 : 0.14;
    var outT = 0.22;
    var total = inT + n.hold + outT;
    var reduced = !this.kit.juice.enabled;

    if (n.kind === 'chip') {
      var a = this.t < inT ? this.t / inT : this.t > inT + n.hold ? 1 - (this.t - inT - n.hold) / outT : 1;
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      var slide = reduced ? 0 : (1 - a) * 14;
      this.chipBg.setAlpha(a).setX(this.chipX + slide);
      this.chipIcon.setAlpha(a).setX(this.chipX + slide + 14);
      this.chipText.setAlpha(a).setX(this.chipX + slide + 30);
    } else {
      var b = this.t < inT ? this.t / inT : this.t > inT + n.hold ? 1 - (this.t - inT - n.hold) / outT : 1;
      b = b < 0 ? 0 : b > 1 ? 1 : b;
      var s = 1;
      if (!reduced && this.t < inT) {
        var u = this.t / inT;
        s = 1 + 1.70158 * Math.pow(u - 1, 3) + 0.70158 * Math.pow(u - 1, 2) + (1 - 1);
        var c1 = 1.70158, c3 = c1 + 1, v = u - 1;
        s = 1 + c3 * v * v * v + c1 * v * v;
        s = 0.86 + 0.14 * s;
      }
      this.banBg.setAlpha(b * 0.94).setScale(this.banW / 2 * s, this.banH / 2 * s);
      this.banEdge.setAlpha(b * 0.9).setScale((this.banW + 4) / 2 * s, (this.banH + 4) / 2 * s);
      this.banText.setAlpha(b).setScale(s);
      this.banSub.setAlpha(b * 0.9).setScale(s);
    }

    if (this.t >= total) { this.active = null; this.hideAll(); }
  };

  RD.Notices.prototype.begin = function (n) {
    var L = this.L;
    this.hideAll();
    if (n.kind === 'chip') {
      var w = Math.min(L.w - 32, 44 + n.text.length * 8.4);
      var key = 'ui-chip';
      this.chipX = L.w - 16 - w;
      this.chipY = L.chipY;
      this.chipBg.setTexture(key).setDisplaySize(w, 34).setPosition(this.chipX, this.chipY).setVisible(true);
      this.chipIcon.setTexture('icon-' + n.icon).setPosition(this.chipX + 14, this.chipY).setVisible(true);
      RD.setTint(this.chipIcon, n.tint);
      RD.setText(this.chipText, n.text);
      this.chipText.setPosition(this.chipX + 30, this.chipY).setVisible(true);
    } else {
      this.banW = Math.round(L.w * 0.60);
      this.banH = n.sub ? 82 : 60;
      var cx = L.w / 2, cy = L.h * 0.42;
      this.banBg.setPosition(cx, cy).setVisible(true).setDisplaySize(1, 1).setScale(this.banW / 2, this.banH / 2);
      this.banEdge.setPosition(cx, cy).setVisible(true).setDisplaySize(1, 1).setScale((this.banW + 4) / 2, (this.banH + 4) / 2);
      RD.setTint(this.banEdge, n.tint);
      RD.setText(this.banText, n.text);
      this.banText.setPosition(cx, n.sub ? cy - 13 : cy).setVisible(true);
      var fit = Math.min(26, Math.max(17, Math.floor(this.banW / Math.max(6, n.text.length) * 1.75)));
      this.banText.setFontSize(fit + 'px');
      if (n.sub) {
        RD.setText(this.banSub, n.sub);
        this.banSub.setPosition(cx, cy + 19).setVisible(true);
      }
    }
  };

  /* ------------------------------------------------------ coach strip */
  /* One thin line at the top edge, one instruction at a time, fades to
     near transparent after about three seconds. Never centred. */
  RD.Coach = function (scene) {
    this.bg = scene.add.image(0, 0, 'px-white').setOrigin(0, 0).setTint(0x0E1626).setAlpha(0).setDepth(190);
    this.text = RD.text(scene, 0, 0, '', 13, '#CFE0F2', 600, 'center').setOrigin(0.5, 0.5).setAlpha(0).setDepth(191);
    this.t = 0; this.life = 0;
  };
  RD.Coach.prototype.layout = function (L) {
    this.L = L;
    /* one thin strip, capped at the 48px the UI law allows */
    var y = L.coachY == null ? L.top : L.coachY;
    this.bg.setPosition(0, y).setDisplaySize(L.w, 46);
    this.text.setPosition(L.w / 2, y + 23);
    this.text.setWordWrapWidth(L.w - 28);
  };
  RD.Coach.prototype.say = function (str, secs) {
    RD.setText(this.text, str);
    this.life = secs || 3.4;
    this.t = 0;
  };
  RD.Coach.prototype.hide = function () { this.life = 0; this.t = 0; this.bg.setAlpha(0); this.text.setAlpha(0); };
  RD.Coach.prototype.update = function (dt) {
    if (this.life <= 0) {
      if (this.bg.alpha > 0) { this.bg.setAlpha(0); this.text.setAlpha(0); }
      return;
    }
    this.t += dt;
    var a = this.t < 0.2 ? this.t / 0.2 : 1;
    var rem = this.life - this.t;
    if (rem < 0.7) a *= Math.max(0, rem / 0.7);
    this.bg.setAlpha(a * 0.82);
    this.text.setAlpha(a);
    if (this.t >= this.life) this.life = 0;
  };

  /* -------------------------------------------------------- scrim card */
  RD.Panel = function (scene, depth) {
    this.scrim = scene.add.image(0, 0, 'px-white').setOrigin(0, 0).setTint(0x080D18).setAlpha(0).setDepth(depth).setVisible(false);
    this.items = [];
    this.depth = depth;
    this.open = false;
  };
  RD.Panel.prototype.layout = function (L) { this.scrim.setDisplaySize(L.w, L.h); };
  RD.Panel.prototype.show = function () {
    this.open = true;
    this.scrim.setVisible(true).setAlpha(0.88);
    this.items.forEach(function (i) { i.setVisible(true); });
  };
  RD.Panel.prototype.hide = function () {
    this.open = false;
    this.scrim.setVisible(false);
    this.items.forEach(function (i) { i.setVisible(false); });
  };

  /* -------------------------------------------------------- utilities */
  RD.fmt = function (n) {
    n = Math.round(n);
    if (n < 1000) return String(n);
    if (n < 100000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return Math.round(n / 1000) + 'k';
  };
  RD.insets = function () {
    var cs = getComputedStyle(document.documentElement);
    function px(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
    return {
      top: px(cs.getPropertyValue('--sat')),
      right: px(cs.getPropertyValue('--sar')),
      bottom: px(cs.getPropertyValue('--sab')),
      left: px(cs.getPropertyValue('--sal'))
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
