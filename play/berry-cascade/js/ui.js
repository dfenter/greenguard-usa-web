/* Berry Cascade - UI primitives built to the /play UI noise law.
 *
 *  - ONE transient at a time. Everything queues through Transients.
 *  - During live play only corner/edge chips are allowed (<=24px text,
 *    <=1.0s hold). Centre banners are boundary-only and refuse to show
 *    while the caller reports live play.
 *  - Icons over labels, >=14px effective text, >=44px touch targets.
 *  - setText/setColor are change-guarded: no per-frame canvas re-render.
 */
var BCUI = (function () {
  'use strict';
  var U = {};

  U.FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  U.TOUCH = 44;

  U.setText = function (obj, str) {
    if (!obj) return;
    str = String(str);
    if (obj.__t !== str) { obj.__t = str; obj.setText(str); }
  };
  U.setColor = function (obj, css) {
    if (!obj) return;
    if (obj.__c !== css) { obj.__c = css; obj.setColor(css); }
  };
  U.setTint = function (obj, tint) {
    if (!obj) return;
    if (obj.__tint !== tint) { obj.__tint = tint; obj.setTint(tint); }
  };

  U.style = function (size, weight, color) {
    return {
      fontFamily: U.FONT,
      fontSize: Math.round(size) + 'px',
      fontStyle: (weight || 700) + '',
      color: color || '#F7FBFF'
    };
  };

  U.text = function (scene, x, y, str, size, weight, color) {
    var t = scene.add.text(x, y, str, U.style(size, weight, color));
    t.__t = String(str);
    t.__c = color || '#F7FBFF';
    t.setOrigin(0.5, 0.5);
    return t;
  };

  /* --------------------------------------------------------- icon button
   * Hit area is forced to at least 44x44 CSS px regardless of art size.
   */
  U.button = function (scene, opts) {
    var size = opts.size || 46;
    var hit = Math.max(U.TOUCH, size);
    var root = scene.add.container(opts.x || 0, opts.y || 0);
    var key = 'bc_btn_' + Math.round(size) + '_' + (opts.fill || 0x2E4269).toString(16) + (opts.round ? 'r' : '');
    if (!scene.textures.exists(key)) {
      BCArt.bakeCard(scene, key, size, size, opts.round ? size / 2 : Math.round(size * 0.28),
        opts.fill == null ? 0x2E4269 : opts.fill, 1, 0x5D7294, 0.65);
    }
    var bg = scene.add.image(0, 0, key);
    var ico = scene.add.image(0, 0, 'bc_ic_' + (opts.icon || 'gear'));
    ico.setDisplaySize(size * 0.56, size * 0.56);
    ico.setTint(opts.tint == null ? 0xF7FBFF : opts.tint);
    root.add(bg); root.add(ico);
    var label = null;
    if (opts.label) {
      label = U.text(scene, 0, size * 0.5 + 11, opts.label, 12, 650, '#B7C4DA');
      root.add(label);
    }
    root.setSize(hit, hit);
    root.setInteractive(new Phaser.Geom.Rectangle(-hit / 2, -hit / 2, hit, hit), Phaser.Geom.Rectangle.Contains);
    var api = {
      root: root, bg: bg, icon: ico, label: label, enabled: true,
      setEnabled: function (v) {
        api.enabled = !!v;
        root.setAlpha(v ? 1 : 0.42);
        if (v) root.setInteractive(); else root.disableInteractive();
        return api;
      },
      setIcon: function (name) {
        if (ico.texture && ico.texture.key === 'bc_ic_' + name) return api;
        ico.setTexture('bc_ic_' + name);
        ico.setDisplaySize(size * 0.56, size * 0.56);
        return api;
      },
      setPos: function (x, y) { root.setPosition(x, y); return api; }
    };
    root.on('pointerdown', function () {
      if (!api.enabled) return;
      root.setScale(0.94);
    });
    root.on('pointerout', function () { root.setScale(1); });
    root.on('pointerup', function () {
      root.setScale(1);
      if (!api.enabled) return;
      if (opts.onPress) opts.onPress();
    });
    return api;
  };

  /* ------------------------------------------------------------- pill button */
  U.pill = function (scene, opts) {
    var w = opts.w || 220, h = Math.max(U.TOUCH, opts.h || 52);
    var root = scene.add.container(opts.x || 0, opts.y || 0);
    var key = 'bc_pill_' + Math.round(w) + 'x' + Math.round(h) + '_' + (opts.fill || 0x5BCB77).toString(16);
    if (!scene.textures.exists(key)) {
      BCArt.bakeCard(scene, key, w, h, h / 2, opts.fill == null ? 0x5BCB77 : opts.fill, 1,
        opts.stroke == null ? 0xF7FBFF : opts.stroke, 0.35);
    }
    var bg = scene.add.image(0, 0, key);
    root.add(bg);
    var ico = null;
    if (opts.icon) {
      ico = scene.add.image(-w * 0.5 + h * 0.56, 0, 'bc_ic_' + opts.icon);
      ico.setDisplaySize(h * 0.50, h * 0.50);
      ico.setTint(opts.iconTint == null ? 0x182238 : opts.iconTint);
      root.add(ico);
    }
    var label = U.text(scene, opts.icon ? h * 0.22 : 0, 0, opts.label || '', opts.size || 18, 750,
      opts.color || '#182238');
    root.add(label);
    root.setSize(w, h);
    root.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    var api = {
      root: root, bg: bg, label: label, icon: ico, enabled: true,
      setLabel: function (s) { U.setText(label, s); return api; },
      setEnabled: function (v) {
        api.enabled = !!v;
        root.setAlpha(v ? 1 : 0.45);
        if (v) root.setInteractive(); else root.disableInteractive();
        return api;
      }
    };
    root.on('pointerdown', function () { if (api.enabled) root.setScale(0.965); });
    root.on('pointerout', function () { root.setScale(1); });
    root.on('pointerup', function () {
      root.setScale(1);
      if (api.enabled && opts.onPress) opts.onPress();
    });
    return api;
  };

  /* ------------------------------------------------------------ HUD chip
   * Icon + tabular value + optional meter. No repeated word labels.
   */
  U.chip = function (scene, opts) {
    var w = opts.w || 84, h = opts.h || 38;
    var root = scene.add.container(opts.x || 0, opts.y || 0);
    var key = 'bc_chip_' + Math.round(w) + 'x' + Math.round(h);
    if (!scene.textures.exists(key)) {
      BCArt.bakeCard(scene, key, w, h, Math.round(h * 0.34), 0x1C2A46, 0.92, 0x5D7294, 0.5);
    }
    var bg = scene.add.image(0, 0, key);
    root.add(bg);
    var ico = scene.add.image(-w * 0.5 + h * 0.50, opts.meter ? -h * 0.10 : 0, 'bc_ic_' + opts.icon);
    ico.setDisplaySize(h * 0.50, h * 0.50);
    ico.setTint(opts.tint == null ? 0xF7FBFF : opts.tint);
    root.add(ico);
    var val = scene.add.text(-w * 0.5 + h * 0.86, opts.meter ? -h * 0.10 : 0, opts.value || '0',
      { fontFamily: U.FONT, fontSize: Math.round(opts.size || 16) + 'px', fontStyle: '750', color: '#F7FBFF' });
    val.setOrigin(0, 0.5);
    val.__t = String(opts.value || '0'); val.__c = '#F7FBFF';
    root.add(val);
    var barBg = null, barFill = null;
    if (opts.meter) {
      var bw = w - h * 0.86 - 10, bh = 5;
      if (!scene.textures.exists('bc_meterbg')) BCArt.bakeBar(scene, 'bc_meterbg', 64, 8, 0x0E1729);
      if (!scene.textures.exists('bc_meterfg')) BCArt.bakeBar(scene, 'bc_meterfg', 64, 8, 0xFFFFFF);
      barBg = scene.add.image(-w * 0.5 + h * 0.80, h * 0.26, 'bc_meterbg').setOrigin(0, 0.5);
      barBg.setDisplaySize(bw, bh);
      barFill = scene.add.image(-w * 0.5 + h * 0.80, h * 0.26, 'bc_meterfg').setOrigin(0, 0.5);
      barFill.setDisplaySize(1, bh);
      barFill.setTint(opts.tint == null ? 0xF7FBFF : opts.tint);
      root.add(barBg); root.add(barFill);
      root.__bw = bw; root.__bh = bh;
    }
    var api = {
      root: root, value: val, icon: ico, fill: barFill,
      set: function (str, frac, colorCss) {
        U.setText(val, str);
        if (colorCss) U.setColor(val, colorCss);
        if (barFill) {
          var f = BC.clamp(frac == null ? 0 : frac, 0, 1);
          if (root.__f !== f) {
            root.__f = f;
            barFill.setDisplaySize(Math.max(1, root.__bw * f), root.__bh);
          }
        }
        return api;
      },
      setDone: function (done) {
        if (root.__done === done) return api;
        root.__done = done;
        U.setTint(ico, done ? 0x5BCB77 : (opts.tint == null ? 0xF7FBFF : opts.tint));
        U.setColor(val, done ? '#5BCB77' : '#F7FBFF');
        return api;
      }
    };
    return api;
  };

  /* --------------------------------------------------------- transients
   * Single active element. Chips are the only thing permitted during live
   * play; banners are boundary-only and are dropped if the scene reports
   * that play is live.
   */
  U.transients = function (scene, layer, opts) {
    opts = opts || {};
    var queue = [];
    var active = null;
    var isLive = opts.isLive || function () { return false; };
    var reduced = opts.reduced || function () { return false; };

    function build(kind) {
      var c = scene.add.container(0, 0);
      c.setDepth(kind === 'banner' ? 60 : 55);
      layer.add(c);
      c.setVisible(false);
      return c;
    }
    var chipBox = build('chip');
    var chipBg = scene.add.image(0, 0, 'bc_px');
    var chipIcon = scene.add.image(0, 0, 'bc_ic_combo');
    var chipText = U.text(scene, 0, 0, '', 15, 750, '#F7FBFF');
    chipBox.add(chipBg); chipBox.add(chipIcon); chipBox.add(chipText);

    var banBox = build('banner');
    var banBg = scene.add.image(0, 0, 'bc_px');
    var banTitle = U.text(scene, 0, -12, '', 26, 800, '#FFFFFF');
    var banSub = U.text(scene, 0, 16, '', 15, 650, '#C9D4E4');
    banBox.add(banBg); banBox.add(banTitle); banBox.add(banSub);

    function layoutChip(item) {
      var pad = 10;
      chipText.setFontSize(15);
      U.setText(chipText, item.text);
      U.setColor(chipText, item.color || '#F7FBFF');
      var tw = chipText.width;
      var w = Math.min(scene.scale.width * 0.60, tw + 30 + pad * 2);
      var h = 32;                                   /* <=24px text height law */
      chipIcon.setTexture('bc_ic_' + (item.icon || 'combo'));
      chipIcon.setDisplaySize(18, 18);
      chipIcon.setTint(item.tint == null ? 0xF7FBFF : item.tint);
      chipIcon.setPosition(-w / 2 + pad + 9, 0);
      chipText.setPosition(-w / 2 + pad + 24, 0);
      chipText.setOrigin(0, 0.5);
      var key = 'bc_toast_' + Math.round(w);
      if (!scene.textures.exists(key)) BCArt.bakeCard(scene, key, w, h, h / 2, 0x101B31, 0.94, 0x5D7294, 0.55);
      chipBg.setTexture(key);
      chipBg.setDisplaySize(w, h);
      chipBox.setPosition(item.x, item.y);
      return { w: w, h: h };
    }

    function layoutBanner(item) {
      var w = Math.min(scene.scale.width * 0.60, 420);
      var h = item.sub ? 92 : 66;
      var key = 'bc_ban_' + Math.round(w) + 'x' + h;
      if (!scene.textures.exists(key)) BCArt.bakeCard(scene, key, w, h, 18, 0x101B31, 0.96, 0xF7FBFF, 0.30);
      banBg.setTexture(key);
      banBg.setDisplaySize(w, h);
      banTitle.setFontSize(item.sub ? 26 : 24);
      U.setText(banTitle, item.text);
      U.setColor(banTitle, item.color || '#FFFFFF');
      banTitle.setOrigin(0.5, 0.5);
      banTitle.setPosition(0, item.sub ? -14 : 0);
      U.setText(banSub, item.sub || '');
      banSub.setVisible(!!item.sub);
      banSub.setPosition(0, 18);
      banBox.setPosition(item.x, item.y);
      return { w: w, h: h };
    }

    function pump() {
      if (active || !queue.length) return;
      var item = queue.shift();
      if (item.kind === 'banner' && isLive()) return pump();   /* law 2 */
      active = item;
      var box = item.kind === 'banner' ? banBox : chipBox;
      if (item.kind === 'banner') layoutBanner(item); else layoutChip(item);
      box.setVisible(true).setAlpha(0);
      var rm = reduced();
      var pop = item.kind === 'banner' ? 1.0 : 1.0;
      box.setScale(rm ? 1 : (item.kind === 'banner' ? 0.86 : 0.92));
      scene.tweens.add({
        targets: box, alpha: 1, scaleX: pop, scaleY: pop,
        duration: rm ? 120 : (item.kind === 'banner' ? 260 : 150),
        ease: rm ? 'Linear' : 'Back.easeOut',
        onComplete: function () {
          scene.time.delayedCall(item.hold, function () {
            scene.tweens.add({
              targets: box, alpha: 0,
              duration: rm ? 120 : 200, ease: 'Cubic.easeIn',
              onComplete: function () {
                box.setVisible(false);
                if (item.onDone) item.onDone();
                active = null;
                pump();
              }
            });
          });
        }
      });
    }

    return {
      /* in-play event: small chip near a HUD anchor, max 1.0s hold */
      chip: function (text, o) {
        o = o || {};
        queue.push({
          kind: 'chip', text: text, icon: o.icon, tint: o.tint, color: o.color,
          x: o.x == null ? scene.scale.width * 0.5 : o.x,
          y: o.y == null ? scene.scale.height * 0.22 : o.y,
          hold: Math.min(1000, o.hold == null ? 700 : o.hold)
        });
        if (queue.length > 3) queue.splice(0, queue.length - 3);
        pump();
      },
      /* run boundary only: centre banner, 60% width */
      banner: function (text, o) {
        o = o || {};
        queue.push({
          kind: 'banner', text: text, sub: o.sub, color: o.color,
          x: o.x == null ? scene.scale.width * 0.5 : o.x,
          y: o.y == null ? scene.scale.height * 0.42 : o.y,
          hold: o.hold == null ? 1000 : o.hold,
          onDone: o.onDone
        });
        pump();
      },
      busy: function () { return !!active; },
      clear: function () {
        queue.length = 0;
        active = null;
        chipBox.setVisible(false); banBox.setVisible(false);
        scene.tweens.killTweensOf(chipBox);
        scene.tweens.killTweensOf(banBox);
      }
    };
  };

  /* -------------------------------------------------------- coach strip
   * One thin line hugging the top edge under the HUD. Never centred, never
   * over the board, fades to near-transparent after ~3s.
   */
  U.coach = function (scene, layer) {
    var box = scene.add.container(0, 0);
    box.setDepth(52);
    layer.add(box);
    var bg = scene.add.image(0, 0, BCArt.bakeSwatch(scene, 'bc_coachbg', 0x0E1729));
    bg.setAlpha(0.86);
    var txt = U.text(scene, 0, 0, '', 14, 650, '#DCE6F5');
    box.add(bg); box.add(txt);
    box.setVisible(false);
    var timer = null, current = '';
    return {
      show: function (msg, x, y, w) {
        if (msg === current && box.visible) return;
        current = msg;
        U.setText(txt, msg);
        var h = 34;                                   /* <=48px law */
        bg.setDisplaySize(w, h);
        box.setPosition(x, y);
        box.setVisible(true);
        box.setAlpha(0);
        scene.tweens.killTweensOf(box);
        scene.tweens.add({ targets: box, alpha: 1, duration: 180 });
        if (timer) { timer.remove(false); timer = null; }
        timer = scene.time.delayedCall(3000, function () {
          scene.tweens.add({
            targets: box, alpha: 0.0, duration: 700,
            onComplete: function () { box.setVisible(false); current = ''; }
          });
        });
      },
      hide: function () {
        if (timer) { timer.remove(false); timer = null; }
        scene.tweens.killTweensOf(box);
        box.setVisible(false); current = '';
      }
    };
  };

  /* ---------------------------------------------------------- gestures
   * GGKit is the single source of pointer identity and now publishes the
   * events itself: onDown fires after the kit has stored its pointer object,
   * onUp fires BEFORE the entry is deleted. The old hand-rolled window
   * listeners could never see a release, because the kit's own pointerup ran
   * first and deleted the id before this helper was reached.
   */
  U.gestures = function (scene, kit, h) {
    var live = Object.create(null);
    function scenePos(p) {
      var b = scene.scale.canvasBounds;
      return { x: p.x - b.x, y: p.y - b.y };
    }
    var offDown = kit.input.onDown(function (kp) {
      if (kit.paused) return;
      live[kp.pointerId] = 1;
      var p = scenePos(kp);
      if (h.onDown) h.onDown(kp.pointerId, p.x, p.y);
    });
    var offMove = kit.input.onMove(function (kp) {
      if (!live[kp.pointerId] || kit.paused) return;
      var p = scenePos(kp);
      if (h.onMove) h.onMove(kp.pointerId, p.x, p.y);
    });
    var offUp = kit.input.onUp(function (kp, e) {
      if (!live[kp.pointerId]) return;
      delete live[kp.pointerId];
      /* e is null for a synthetic drop (blur, pause, restart): that is a
       * cancellation, never a tap. A real release delivered while paused is
       * a stale one and is ignored the same way it always was. */
      if (!e || kit.paused) return;
      var p = scenePos(kp);
      if (h.onUp) h.onUp(kp.pointerId, p.x, p.y);
    });
    var api = {
      clear: function () {
        live = Object.create(null);
        kit.input.clearAll();
      },
      destroy: function () {
        offDown(); offMove(); offUp();
        live = Object.create(null);
      }
    };
    scene.events.once('shutdown', api.destroy);
    scene.events.once('destroy', api.destroy);
    return api;
  };

  /* Safe-area insets in CSS px, read once per layout. */
  U.insets = function () {
    var s = getComputedStyle(document.documentElement);
    function v(name, fb) {
      var raw = s.getPropertyValue(name);
      var n = parseFloat(raw);
      return isFinite(n) ? n : fb;
    }
    return {
      top: v('--sat', 0), right: v('--sar', 0),
      bottom: v('--sab', 0), left: v('--sal', 0)
    };
  };

  return U;
})();
