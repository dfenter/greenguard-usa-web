/* Kinetic Burst - UI primitives built to the /play UI noise law.
 *
 *  - ONE transient at a time; everything queues through Transients.
 *  - Live play may only raise small corner chips (<=24px text, <=1.0s hold).
 *    Centre banners are refused while the caller reports live play.
 *  - Icons over labels, >=14px effective text, >=44px touch targets.
 *  - setText / setColor / setTint are change guarded so no text object
 *    re-renders its canvas on a frame where nothing changed.
 */
var KBUI = (function () {
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
  U.setAlpha = function (obj, a) {
    if (!obj) return;
    if (obj.__a !== a) { obj.__a = a; obj.setAlpha(a); }
  };

  U.style = function (size, weight, color) {
    return {
      fontFamily: U.FONT,
      fontSize: Math.round(size) + 'px',
      fontStyle: (weight || 700) + '',
      color: color || '#F7FBFF',
      resolution: GGKit.hiDpi.dpr()
    };
  };

  U.text = function (scene, x, y, str, size, weight, color) {
    var t = scene.add.text(x, y, str, U.style(size, weight, color));
    t.__t = String(str);
    t.__c = color || '#F7FBFF';
    t.setOrigin(0.5, 0.5);
    return t;
  };

  /* ------------------------------------------------------- icon button */
  U.button = function (scene, opts) {
    var size = opts.size || 46;
    var hit = Math.max(U.TOUCH, size);
    var root = scene.add.container(opts.x || 0, opts.y || 0);
    var fill = opts.fill == null ? 0x243453 : opts.fill;
    var key = 'kb_btn_' + Math.round(size) + '_' + fill.toString(16) + (opts.round ? 'r' : '');
    KBArt.bakeCard(scene, key, size, size, opts.round ? size / 2 : Math.round(size * 0.28),
      fill, 1, 0x6B85B5, 0.7);
    var bg = scene.add.image(0, 0, key);
    var ico = scene.add.image(0, 0, 'kb_ic_' + (opts.icon || 'gear'));
    ico.setDisplaySize(size * 0.54, size * 0.54);
    ico.setTint(opts.tint == null ? 0xF7FBFF : opts.tint);
    root.add(bg); root.add(ico);
    if (opts.label) root.add(U.text(scene, 0, size * 0.5 + 12, opts.label, 12, 650, '#B7C4DA'));
    root.setSize(hit, hit);
    root.setInteractive(new Phaser.Geom.Rectangle(-hit / 2, -hit / 2, hit, hit), Phaser.Geom.Rectangle.Contains);
    var api = {
      root: root, bg: bg, icon: ico, enabled: true,
      setEnabled: function (v) {
        api.enabled = !!v;
        root.setAlpha(v ? 1 : 0.42);
        if (v) root.setInteractive(); else root.disableInteractive();
        return api;
      },
      setIcon: function (name) {
        var k = 'kb_ic_' + name;
        if (ico.texture && ico.texture.key === k) return api;
        ico.setTexture(k);
        ico.setDisplaySize(size * 0.54, size * 0.54);
        return api;
      }
    };
    root.on('pointerdown', function () { if (api.enabled) root.setScale(0.94); });
    root.on('pointerout', function () { root.setScale(1); });
    root.on('pointerup', function () {
      root.setScale(1);
      if (api.enabled && opts.onPress) opts.onPress();
    });
    return api;
  };

  /* -------------------------------------------------------------- pill */
  U.pill = function (scene, opts) {
    var w = opts.w || 240, h = Math.max(U.TOUCH, opts.h || 54);
    var root = scene.add.container(opts.x || 0, opts.y || 0);
    var fill = opts.fill == null ? 0x38A8DE : opts.fill;
    var key = 'kb_pill_' + Math.round(w) + 'x' + Math.round(h) + '_' + fill.toString(16);
    KBArt.bakeCard(scene, key, w, h, h / 2, fill, 1, opts.stroke == null ? 0xF7FBFF : opts.stroke, 0.32);
    var bg = scene.add.image(0, 0, key);
    root.add(bg);
    if (opts.icon) {
      var ico = scene.add.image(-w * 0.5 + h * 0.56, 0, 'kb_ic_' + opts.icon);
      ico.setDisplaySize(h * 0.48, h * 0.48);
      ico.setTint(opts.iconTint == null ? 0x101828 : opts.iconTint);
      root.add(ico);
    }
    var label = U.text(scene, opts.icon ? h * 0.24 : 0, 0, opts.label || '', opts.size || 18, 750,
      opts.color || '#101828');
    root.add(label);
    root.setSize(w, h);
    root.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    var api = {
      root: root, label: label, enabled: true,
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

  /* --------------------------------------------------------- HUD chip */
  U.chip = function (scene, opts) {
    var w = opts.w || 88, h = opts.h || 34;
    var root = scene.add.container(opts.x || 0, opts.y || 0);
    var key = 'kb_chip_' + Math.round(w) + 'x' + Math.round(h);
    KBArt.bakeCard(scene, key, w, h, Math.round(h * 0.34), 0x141B2E, 0.92, 0x6B85B5, 0.45);
    root.add(scene.add.image(0, 0, key));
    var ico = scene.add.image(-w * 0.5 + h * 0.52, 0, 'kb_ic_' + (opts.icon || 'star'));
    ico.setDisplaySize(h * 0.52, h * 0.52);
    ico.setTint(opts.tint == null ? 0xF7FBFF : opts.tint);
    root.add(ico);
    var val = scene.add.text(-w * 0.5 + h * 0.92, 0, String(opts.value == null ? '0' : opts.value),
      { fontFamily: U.FONT, fontSize: Math.round(opts.size || 15) + 'px', fontStyle: '750', color: '#F7FBFF', resolution: GGKit.hiDpi.dpr() });
    val.setOrigin(0, 0.5);
    val.__t = String(opts.value == null ? '0' : opts.value);
    val.__c = '#F7FBFF';
    root.add(val);
    return {
      root: root, value: val, icon: ico,
      set: function (str, colorCss) {
        U.setText(val, str);
        if (colorCss) U.setColor(val, colorCss);
      },
      setTint: function (t) { U.setTint(ico, t); }
    };
  };

  /* --------------------------------------------------------------- bar */
  U.bar = function (scene, parent, x, y, w, h, tint) {
    var bg = scene.add.image(x, y, 'kb_bar_bg').setOrigin(0, 0.5);
    bg.setDisplaySize(w, h);
    var fg = scene.add.image(x, y, 'kb_bar_fg').setOrigin(0, 0.5);
    fg.setDisplaySize(w, h);
    fg.setTint(tint == null ? 0x5BCB77 : tint);
    parent.add(bg); parent.add(fg);
    var state = { f: -1, w: w };
    return {
      bg: bg, fg: fg,
      set: function (frac) {
        var f = KB.clamp(frac, 0, 1);
        if (Math.abs(state.f - f) < 0.004) return;
        state.f = f;
        fg.setDisplaySize(Math.max(1, state.w * f), h);
      },
      tint: function (t) { U.setTint(fg, t); },
      resize: function (nw) { state.w = nw; state.f = -1; bg.setDisplaySize(nw, h); }
    };
  };

  /* -------------------------------------------------------- transients */
  U.transients = function (scene, layer, opts) {
    opts = opts || {};
    var queue = [];
    var active = null;
    var isLive = opts.isLive || function () { return false; };
    var reduced = opts.reduced || function () { return false; };

    var chipBox = scene.add.container(0, 0).setDepth(55);
    layer.add(chipBox); chipBox.setVisible(false);
    var chipBg = scene.add.image(0, 0, 'kb_px');
    var chipIcon = scene.add.image(0, 0, 'kb_ic_star');
    var chipText = U.text(scene, 0, 0, '', 15, 750, '#F7FBFF');
    chipBox.add(chipBg); chipBox.add(chipIcon); chipBox.add(chipText);

    var banBox = scene.add.container(0, 0).setDepth(60);
    layer.add(banBox); banBox.setVisible(false);
    var banBg = scene.add.image(0, 0, 'kb_px');
    var banTitle = U.text(scene, 0, -12, '', 26, 800, '#FFFFFF');
    var banSub = U.text(scene, 0, 16, '', 15, 650, '#C9D4E4');
    banBox.add(banBg); banBox.add(banTitle); banBox.add(banSub);

    function layoutChip(item) {
      chipText.setFontSize(15);
      U.setText(chipText, item.text);
      U.setColor(chipText, item.color || '#F7FBFF');
      var w = Math.min(scene.scale.width * 0.6, chipText.width + 54);
      var h = 32;
      chipIcon.setTexture('kb_ic_' + (item.icon || 'star'));
      chipIcon.setDisplaySize(18, 18);
      chipIcon.setTint(item.tint == null ? 0xF7FBFF : item.tint);
      chipIcon.setPosition(-w / 2 + 19, 0);
      chipText.setPosition(-w / 2 + 34, 0);
      chipText.setOrigin(0, 0.5);
      var key = 'kb_toast_' + Math.round(w);
      KBArt.bakeCard(scene, key, w, h, h / 2, 0x101828, 0.94, 0x6B85B5, 0.55);
      chipBg.setTexture(key);
      chipBg.setDisplaySize(w, h);
      chipBox.setPosition(item.x, item.y);
    }

    function layoutBanner(item) {
      var w = Math.min(scene.scale.width * 0.6, 420);
      var h = item.sub ? 96 : 68;
      var key = 'kb_ban_' + Math.round(w) + 'x' + h;
      KBArt.bakeCard(scene, key, w, h, 18, 0x101828, 0.96, 0xF7FBFF, 0.3);
      banBg.setTexture(key);
      banBg.setDisplaySize(w, h);
      banTitle.setFontSize(item.sub ? 26 : 24);
      U.setText(banTitle, item.text);
      U.setColor(banTitle, item.color || '#FFFFFF');
      banTitle.setPosition(0, item.sub ? -14 : 0);
      U.setText(banSub, item.sub || '');
      banSub.setVisible(!!item.sub);
      banSub.setPosition(0, 18);
      banBox.setPosition(item.x, item.y);
    }

    function pump() {
      if (active || !queue.length) return;
      var item = queue.shift();
      if (item.kind === 'banner' && isLive()) { pump(); return; }
      active = item;
      var box = item.kind === 'banner' ? banBox : chipBox;
      if (item.kind === 'banner') layoutBanner(item); else layoutChip(item);
      box.setVisible(true).setAlpha(0);
      var rm = reduced();
      box.setScale(rm ? 1 : (item.kind === 'banner' ? 0.86 : 0.92));
      scene.tweens.add({
        targets: box, alpha: 1, scaleX: 1, scaleY: 1,
        duration: rm ? 120 : (item.kind === 'banner' ? 260 : 150),
        ease: rm ? 'Linear' : 'Back.easeOut',
        onComplete: function () {
          scene.time.delayedCall(item.hold, function () {
            scene.tweens.add({
              targets: box, alpha: 0, duration: rm ? 120 : 200, ease: 'Cubic.easeIn',
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

  /* ------------------------------------------------------- coach strip */
  U.coach = function (scene, layer) {
    var box = scene.add.container(0, 0).setDepth(52);
    layer.add(box);
    var bg = scene.add.image(0, 0, KBArt.bakeSwatch(scene, 'kb_coachbg', 0x0E1729));
    bg.setAlpha(0.86);
    var txt = U.text(scene, 0, 0, '', 14, 650, '#DCE6F5');
    box.add(bg); box.add(txt);
    box.setVisible(false);
    var timer = null, current = '';
    return {
      show: function (msg, x, y, w) {
        if (msg === current && box.visible) return;
        current = msg;
        /* the strip hugs its one line: never a full width slab of chrome */
        txt.setFontSize(13);
        U.setText(txt, msg);
        bg.setDisplaySize(Math.min(w, txt.width + 26), 30);
        box.setPosition(x, y);
        box.setVisible(true);
        box.setAlpha(0);
        scene.tweens.killTweensOf(box);
        scene.tweens.add({ targets: box, alpha: 1, duration: 180 });
        if (timer) { timer.remove(false); timer = null; }
        timer = scene.time.delayedCall(3000, function () {
          scene.tweens.add({
            targets: box, alpha: 0, duration: 700,
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

  /* ----------------------------------------------------------- gestures
   * GGKit is the single source of pointer identity and now publishes the
   * events itself: onDown fires after the kit has stored its pointer object,
   * onUp fires BEFORE the entry is deleted. The local workaround this
   * replaces existed only because the kit's own pointerup deleted the id
   * before any listener a title registered later could run.
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
      /* e is null for a synthetic drop (blur, pause, restart), which the kit
       * now reports so nothing can leak a stuck gesture: that is a
       * cancellation, not a release. A real release delivered while paused
       * is a stale one and is ignored, as before. */
      if (!e || kit.paused) return;
      var p = scenePos(kp);
      if (h.onUp) h.onUp(kp.pointerId, p.x, p.y);
    });
    function drop() { live = Object.create(null); }
    document.addEventListener('visibilitychange', drop);
    var api = {
      clear: function () { live = Object.create(null); kit.input.clearAll(); },
      destroy: function () {
        offDown(); offMove(); offUp();
        document.removeEventListener('visibilitychange', drop);
        live = Object.create(null);
      }
    };
    scene.events.once('shutdown', api.destroy);
    scene.events.once('destroy', api.destroy);
    return api;
  };

  /* Safe area insets in CSS px. */
  U.insets = function () {
    var s = getComputedStyle(document.documentElement);
    function v(name, fb) {
      var n = parseFloat(s.getPropertyValue(name));
      return isFinite(n) ? n : fb;
    }
    return { top: v('--sat', 0), right: v('--sar', 0), bottom: v('--sab', 0), left: v('--sal', 0) };
  };

  /* Scrolling parallax backdrop shared by every scene. */
  U.backdrop = function (scene, arc, depth) {
    var W = scene.scale.width, H = scene.scale.height;
    var skyKey = 'kb_sky_' + arc.id;
    KBArt.bakeSky(scene, skyKey, W, H, arc);
    var sky = scene.add.image(0, 0, skyKey).setOrigin(0, 0).setDepth(depth == null ? -20 : depth);
    sky.setDisplaySize(W, H);
    var bands = [];
    for (var i = 0; i < 3; i++) {
      var key = 'kb_band_' + arc.id + '_' + i;
      KBArt.bakeBand(scene, key, 512, 150, arc, i);
      var y = H * (0.34 + i * 0.13);
      var img = scene.add.tileSprite(0, y, W, 150, key).setOrigin(0, 0);
      img.setDepth((depth == null ? -20 : depth) + 1 + i);
      img.setAlpha(0.30 + i * 0.13);
      bands.push(img);
    }
    return {
      sky: sky, bands: bands,
      update: function (dt) {
        for (var i = 0; i < bands.length; i++) {
          bands[i].tilePositionX += dt * (4 + i * 7);
        }
      },
      resize: function (w, h) {
        sky.setDisplaySize(w, h);
        for (var i = 0; i < bands.length; i++) {
          bands[i].setSize(w, 150);
          bands[i].y = h * (0.34 + i * 0.13);
        }
      }
    };
  };

  return U;
})();
