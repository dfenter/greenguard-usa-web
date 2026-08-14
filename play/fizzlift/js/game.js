/* Fizzlift - Phaser 3 view, HUD, modes and lifecycle.
 *
 * House rules honoured here on purpose:
 *  - GGKit is the ONLY lifecycle, input, save, audio and juice implementation.
 *  - No static Graphics in the display list. Every plate, ring, frame and glyph
 *    is a baked canvas texture from art.js, blitted as a pooled Image.
 *  - The view stores no state on simulation cells. Piece records live in a
 *    view-owned map keyed by cell id and are recycled through a pool.
 *  - Debug/verification state is a preallocated object shared by the boot
 *    fallback and the live scene; it never aliases a live pool.
 *  - The frame clock is clamped: a degraded device runs in slow motion, it
 *    never time-skips past the stepped resolution.
 *  - UI Noise Law: one transient at a time, in-play events are corner chips,
 *    centre banners only at run boundaries, icons over labels.
 */
(function (FZ, root) {
  'use strict';

  var COLS = FZ.COLS, ROWS = FZ.ROWS, K = FZ.K;
  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  var DPR = Math.min(2, (root.devicePixelRatio || 1));

  /* ------------------------------------------------- verification hook */
  /* Preallocated. The boot fallback and the live scene write the SAME object,
     and its array fields are private copies, never a live pool alias. */
  var FZ_STATE = {
    ready: false,
    scene: 'boot',
    mode: 'menu',          /* 'ladder' | 'rush' | 'endless' | 'menu' */
    level: 0,
    round: 0,
    vat: 0,
    vatName: '',
    levelName: '',
    fizzLine: 0,           /* mean fizz line row */
    fizzLineCols: [0, 0, 0, 0, 0, 0, 0],
    moves: 0,
    movesMax: 0,
    movesUsed: 0,
    seals: 0,
    sealsTotal: 0,
    sealsBroken: 0,
    caps: 0,
    capsGoal: 0,
    score: 0,
    best: 0,
    chain: 0,
    medal: 0,
    phase: 'boot',
    transients: 0,
    reducedMotion: false,
    /* switches the orchestrator can set */
    forceMode: null,
    forceLevel: -1,
    forceRound: -1
  };
  root.__fz = root.__fz || {};
  root.__fz.state = FZ_STATE;

  /* ---------------------------------------------------------- GGKit */
  var kit = GGKit.create({
    slug: 'fizzlift',
    orientation: 'portrait',
    validateSave: FZ.validateSave,
    onPause: function () {
      var s = activePlay();
      if (s) s.freeze();
    },
    onResume: function () {
      var s = activePlay();
      if (s && !s.pauseMode) s.thaw();
    },
    onRestart: function () {
      var s = activePlay();
      if (s) s.restartLevel();
    }
  });
  if (FZ.prefersReducedMotion()) kit.juice.enabled = false;
  FZ_STATE.reducedMotion = !kit.juice.enabled;

  var GAME = null;
  function activePlay() {
    if (!GAME || !GAME.scene) return null;
    var s = GAME.scene.getScene('play');
    return (s && s.scene.isActive() && s.boardReady) ? s : null;
  }

  /* ------------------------------------------------------------ save */
  var SAVE = FZ.normalizeSave(kit.save.get(null));
  function persist() { kit.save.set(SAVE); }

  /* ------------------------------------------------------- text util */
  function txt(scene, x, y, str, size, color, weight, originX, originY) {
    var t = scene.add.text(x, y, str, {
      fontFamily: FONT,
      fontSize: size + 'px',
      fontStyle: weight || '600',
      color: color || '#E7EEF7',
      resolution: DPR
    });
    t.setOrigin(originX === undefined ? 0.5 : originX, originY === undefined ? 0.5 : originY);
    t.__fzText = str;
    t.__fzColor = color;
    return t;
  }

  /* ------------------------------------------------------ button rack */
  /* Icon-first, >=44px, hit-tested against GGKit pointer coordinates. */
  function Buttons(scene) {
    this.scene = scene;
    this.list = [];
    this.down = null;
  }
  Buttons.prototype.clear = function () {
    for (var i = 0; i < this.list.length; i++) {
      var b = this.list[i];
      if (b.plate) b.plate.destroy();
      if (b.icon) b.icon.destroy();
      if (b.label) b.label.destroy();
      if (b.sub) b.sub.destroy();
      if (b.badge) b.badge.destroy();
    }
    this.list.length = 0;
    this.down = null;
  };
  Buttons.prototype.add = function (o) {
    var s = this.scene;
    var w = Math.max(44, o.w || 44), h = Math.max(44, o.h || 44);
    var b = {
      x: o.x, y: o.y, w: w, h: h, onTap: o.onTap,
      enabled: o.enabled !== false, key: o.key || ''
    };
    if (o.plate !== false) {
      b.plate = s.add.image(o.x, o.y, b.enabled ? (o.pri ? 'btnPri' : 'btn') : 'btnLock');
      b.plate.setDisplaySize(w, h).setDepth(o.depth || 120);
      if (!b.enabled) b.plate.setAlpha(0.72);
    }
    if (o.icon) {
      b.icon = s.add.image(o.iconX === undefined ? o.x : o.iconX, o.iconY === undefined ? o.y : o.iconY, o.icon);
      b.icon.setDisplaySize(o.iconSize || 26, o.iconSize || 26).setDepth((o.depth || 120) + 1);
      if (o.iconTint) b.icon.setTint(o.iconTint);
      if (!b.enabled) b.icon.setAlpha(0.5);
    }
    if (o.label) {
      b.label = txt(s, o.labelX === undefined ? o.x : o.labelX, o.labelY === undefined ? o.y : o.labelY,
        o.label, o.labelSize || 16, b.enabled ? '#E7EEF7' : '#7E8DA3', o.labelWeight || '700');
      b.label.setDepth((o.depth || 120) + 1);
    }
    if (o.sub) {
      b.sub = txt(s, o.x, o.subY === undefined ? o.y + 18 : o.subY, o.sub, o.subSize || 12, '#8FA3BA', '600');
      b.sub.setDepth((o.depth || 120) + 1);
    }
    if (o.badge) {
      b.badge = s.add.image(o.badgeX === undefined ? o.x : o.badgeX, o.badgeY === undefined ? o.y : o.badgeY, o.badge);
      b.badge.setDisplaySize(o.badgeSize || 24, o.badgeSize || 24).setDepth((o.depth || 120) + 2);
    }
    this.list.push(b);
    return b;
  };
  Buttons.prototype.hit = function (x, y) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var b = this.list[i];
      if (!b.enabled) continue;
      if (x >= b.x - b.w / 2 && x <= b.x + b.w / 2 && y >= b.y - b.h / 2 && y <= b.y + b.h / 2) return b;
    }
    return null;
  };
  Buttons.prototype.onDown = function (x, y) {
    var b = this.hit(x, y);
    this.down = b;
    if (b && b.plate) b.plate.setScale(b.plate.scaleX * 0.96, b.plate.scaleY * 0.96);
    return !!b;
  };
  Buttons.prototype.onUp = function (x, y) {
    var b = this.down;
    this.down = null;
    if (b && b.plate) b.plate.setDisplaySize(b.w, b.h);
    if (!b) return false;
    var hit = this.hit(x, y);
    if (hit !== b) return false;
    kit.audio.sfx('sfx_ui', { volume: 0.5 });
    if (b.onTap) b.onTap();
    return true;
  };

  /* ---------------------------------------------------- pointer bridge */
  /* GGKit owns pointer identity. Scenes poll the map rather than adding a
     second input path, so a pause or restart clears everything at once. */
  function PointerBridge(scene) {
    this.scene = scene;
    this.known = {};
    this.rect = { left: 0, top: 0 };
  }
  PointerBridge.prototype.refreshRect = function () {
    var cv = this.scene.game.canvas;
    if (!cv || !cv.getBoundingClientRect) return;
    var r = cv.getBoundingClientRect();
    this.rect.left = r.left;
    this.rect.top = r.top;
  };
  PointerBridge.prototype.poll = function (onDown, onMove, onUp) {
    var pointers = kit.input.pointers, id;
    var seen = {};
    var it = pointers.entries();
    var next = it.next();
    while (!next.done) {
      /* Ids are normalised to strings on EVERY path. The live map is keyed by
         numeric pointerId while the release sweep walks object keys, and a
         number/string mismatch silently swallowed every pointer release. */
      id = String(next.value[0]);
      var p = next.value[1];
      seen[id] = 1;
      var gx = p.x - this.rect.left, gy = p.y - this.rect.top;
      var sx = p.startX - this.rect.left, sy = p.startY - this.rect.top;
      if (!this.known[id]) {
        this.known[id] = { x: gx, y: gy, sx: sx, sy: sy };
        if (onDown) onDown(id, sx, sy);
      } else {
        this.known[id].x = gx;
        this.known[id].y = gy;
        if (onMove) onMove(id, gx, gy, this.known[id].sx, this.known[id].sy);
      }
      next = it.next();
    }
    for (id in this.known) {
      if (seen[id]) continue;
      var k = this.known[id];
      delete this.known[id];
      if (onUp) onUp(id, k.x, k.y, k.sx, k.sy);
    }
  };
  PointerBridge.prototype.clear = function () { this.known = {}; };

  /* -------------------------------------------------- particle systems */
  /* Three pooled systems, exactly as the lane floor requires: clear
     fragments, directional float/fall trails, reward celebration. Nothing is
     allocated after construction. */
  function Pool(scene, texture, n, depth, blend) {
    this.items = [];
    for (var i = 0; i < n; i++) {
      var img = scene.add.image(-999, -999, texture);
      img.setDepth(depth).setVisible(false);
      if (blend) img.setBlendMode(Phaser.BlendModes.ADD);
      this.items.push({
        img: img, live: false, x: 0, y: 0, vx: 0, vy: 0,
        life: 0, ttl: 1, s0: 1, s1: 0, rot: 0, spin: 0, grav: 0, a0: 1
      });
    }
    this.next = 0;
  }
  Pool.prototype.emit = function (o) {
    var p = null, i;
    for (i = 0; i < this.items.length; i++) {
      var j = (this.next + i) % this.items.length;
      if (!this.items[j].live) { p = this.items[j]; this.next = (j + 1) % this.items.length; break; }
    }
    if (!p) { p = this.items[this.next]; this.next = (this.next + 1) % this.items.length; }
    p.live = true;
    p.x = o.x; p.y = o.y;
    p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = 0; p.ttl = o.ttl || 0.5;
    p.s0 = o.s0 || 10; p.s1 = (o.s1 === undefined ? 0 : o.s1);
    p.rot = o.rot || 0; p.spin = o.spin || 0;
    p.grav = o.grav || 0;
    p.a0 = o.alpha === undefined ? 1 : o.alpha;
    p.img.setTint(o.tint === undefined ? 0xffffff : o.tint);
    p.img.setVisible(true);
    return p;
  };
  Pool.prototype.update = function (dt) {
    for (var i = 0; i < this.items.length; i++) {
      var p = this.items[i];
      if (!p.live) continue;
      p.life += dt;
      var k = p.life / p.ttl;
      if (k >= 1) {
        p.live = false;
        p.img.setVisible(false);
        p.img.setPosition(-999, -999);
        continue;
      }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      var s = p.s0 + (p.s1 - p.s0) * k;
      p.img.setPosition(p.x, p.y);
      p.img.setDisplaySize(s, s);
      p.img.setRotation(p.rot);
      p.img.setAlpha(p.a0 * (1 - k * k));
    }
  };
  Pool.prototype.reset = function () {
    for (var i = 0; i < this.items.length; i++) {
      this.items[i].live = false;
      this.items[i].img.setVisible(false).setPosition(-999, -999);
    }
  };

  /* ==================================================== BOOT SCENE ==== */
  var BootScene = {
    key: 'boot',

    create: function () {
      var self = this;
      FZ_STATE.scene = 'boot';
      FZ_STATE.phase = 'boot';
      this.cameras.main.setBackgroundColor('#0B0F16');
      kit.loader.show('Fizzlift');

      /* bake everything that never changes, plus a default vat and board so no
         scene ever adds an Image against a texture key that does not exist yet */
      FZ.art.bakeStatic(this);
      FZ.art.bakeVat(this, FZ.vat(0), this.scale.width, this.scale.height);
      FZ.art.bakeBoard(this, FZ.vat(0), { pad: 12, cell: 44, cols: COLS, rows: ROWS });
      kit.loader.progress(0.25);

      FZ.buildAudio(kit, function (f) {
        kit.loader.progress(0.25 + f * 0.55);
      }, function () {
        kit.audio.preload(['sfx_ui', 'sfx_select', 'sfx_swap', 'sfx_invalid',
          'sfx_clear', 'sfx_cap', 'sfx_crack', 'sfx_valve']).then(function () {
          kit.loader.progress(1);
          kit.loader.hide();
          self.launch();
        }, function () {
          kit.loader.hide();
          self.launch();
        });
      });

      kit.registerPWA();
    },

    extend: {
      /* The test switches must be readable from the boot fallback AND from the
         live scene, so a harness can force a mode before the first frame. */
      launch: function () {
        FZ_STATE.ready = true;
        var fm = FZ_STATE.forceMode;
        if (fm === 'ladder' || fm === 'rush' || fm === 'endless') {
          var lv = FZ_STATE.forceLevel >= 0 ? FZ_STATE.forceLevel : 0;
          var rd = FZ_STATE.forceRound >= 0 ? FZ_STATE.forceRound : 0;
          FZ_STATE.forceMode = null;
          FZ_STATE.forceLevel = -1;
          FZ_STATE.forceRound = -1;
          this.scene.start('play', { mode: fm, level: lv, round: rd });
          return;
        }
        this.scene.start('menu', { view: 'home' });
      }
    }
  };

  /* ==================================================== MENU SCENE ==== */
  var MenuScene = {
    key: 'menu',

    init: function (data) {
      this.view = (data && data.view) || 'home';
      this.vatIndex = (data && data.vat) || 0;
    },

    create: function () {
      var self = this;
      FZ_STATE.scene = 'menu';
      FZ_STATE.mode = 'menu';
      FZ_STATE.phase = 'menu';
      this.btns = new Buttons(this);
      this.bridge = new PointerBridge(this);
      this.parts = [];
      this.vat = FZ.vat(this.vatIndex);

      this.bg = this.add.image(0, 0, 'backdrop').setOrigin(0, 0).setDepth(0);
      this.scale.on('resize', this.relayout, this);
      this.events.once('shutdown', function () {
        self.scale.off('resize', self.relayout, self);
      });
      this.relayout();
      kit.audio.music('music_rush', 700);
    },

    update: function (time, delta) {
      var self = this;
      /* the harness switches are live here too, not only in the boot fallback */
      var fm = FZ_STATE.forceMode;
      if (fm === 'ladder' || fm === 'rush' || fm === 'endless') {
        var lv = FZ_STATE.forceLevel >= 0 ? FZ_STATE.forceLevel : 0;
        var rd = FZ_STATE.forceRound >= 0 ? FZ_STATE.forceRound : 0;
        FZ_STATE.forceMode = null; FZ_STATE.forceLevel = -1; FZ_STATE.forceRound = -1;
        this.scene.start('play', { mode: fm, level: lv, round: rd });
        return;
      }
      if (kit.paused) return;
      this.bridge.poll(
        function (id, x, y) { self.btns.onDown(x, y); },
        null,
        function (id, x, y) { self.btns.onUp(x, y); }
      );
      /* keyboard: Esc backs out of a sub view */
      var esc = kit.input.keyDown('Escape');
      if (esc && !this.escPrev && this.view !== 'home') this.show('home');
      this.escPrev = esc;
    },

    extend: {
      relayout: function () {
        var W = this.scale.width, H = this.scale.height;
        FZ.art.bakeVat(this, this.vat, W, H);
        this.bg.setTexture('backdrop');
        this.bg.setDisplaySize(W, H);
        this.bridge.refreshRect();
        this.show(this.view);
      },

      wipe: function () {
        this.btns.clear();
        for (var i = 0; i < this.parts.length; i++) if (this.parts[i]) this.parts[i].destroy();
        this.parts.length = 0;
      },

      keep: function (obj) { this.parts.push(obj); return obj; },

      show: function (view) {
        this.view = view;
        this.wipe();
        if (view === 'ladder') this.buildLadder();
        else if (view === 'rush') this.buildRush();
        else this.buildHome();
      },

      titleBlock: function (title, sub) {
        var W = this.scale.width;
        var ins = FZ.safeInsets();
        var y = ins.top + 46;
        this.keep(txt(this, W / 2, y, title, 28, '#F7FBFF', '800'));
        if (sub) this.keep(txt(this, W / 2, y + 26, sub, 14, '#8FA3BA', '600'));
        return y + 52;
      },

      buildHome: function () {
        var self = this, W = this.scale.width, H = this.scale.height;
        var ins = FZ.safeInsets();
        var y = ins.top + 64;

        /* wordmark: a cap rising out of the fizz */
        var cap = this.keep(this.add.image(W / 2, y - 18, 'cap'));
        cap.setDisplaySize(56, 56).setDepth(110);
        this.keep(txt(this, W / 2, y + 34, 'FIZZLIFT', 34, '#F7FBFF', '800'));
        this.keep(txt(this, W / 2, y + 64, 'Below the line it floats. Above it, it falls.', 14, '#9DB2C8', '600'));

        var bw = Math.min(320, W - 48), bx = W / 2;
        var by = y + 118;
        var gap = 76;

        var medals = 0, campaignKey;
        for (campaignKey in SAVE.stars) if ((SAVE.stars[campaignKey] | 0) > 0) medals++;
        var tiers = FZ.totalTiers(SAVE);

        this.btns.add({
          x: bx, y: by, w: bw, h: 64, pri: true, icon: 'ic_play', iconSize: 26,
          iconX: bx - bw / 2 + 34, label: 'Fizzlift ladder', labelX: bx + 12,
          onTap: function () { self.show('ladder'); }
        });
        this.keep(txt(this, bx + bw / 2 - 16, by, medals + '/' + FZ.LEVELS.length, 13, '#BFD4E8', '700', 1, 0.5)).setDepth(122);

        this.btns.add({
          x: bx, y: by + gap, w: bw, h: 64, icon: 'ic_seal', iconSize: 26,
          iconX: bx - bw / 2 + 34, label: 'Seal Rush', labelX: bx + 12,
          onTap: function () { self.show('rush'); }
        });

        this.btns.add({
          x: bx, y: by + gap * 2, w: bw, h: 64, icon: 'ic_score', iconSize: 26,
          iconX: bx - bw / 2 + 34, label: 'Endless Fizz', labelX: bx + 12,
          onTap: function () { self.scene.start('play', { mode: 'endless', level: 0, round: 0 }); }
        });
        if (SAVE.best > 0) {
          this.keep(txt(this, bx + bw / 2 - 16, by + gap * 2, String(SAVE.best), 13, '#BFD4E8', '700', 1, 0.5)).setDepth(122);
        }

        /* medal shelf: the only always-on progression readout, and it lives in
           a menu, never over the board */
        var shelfY = by + gap * 3 + 8;
        this.keep(txt(this, W / 2, shelfY, 'Medals ' + medals + '   Tiers ' + tiers, 14, '#8FA3BA', '650'));
        for (var m = 1; m <= 3; m++) {
          var mi = this.keep(this.add.image(W / 2 + (m - 2) * 46, shelfY + 40, 'medal' + m));
          mi.setDisplaySize(40, 40).setDepth(110);
        }

        /* vat lineup: the home screen names the world instead of leaving a
           dead band under the mode buttons */
        var vy = shelfY + 86;
        for (var v = 0; v < FZ.VATS.length; v++) {
          var vt = FZ.vat(v);
          var pr = FZ.vatProgress(SAVE, v);
          var vx = W / 2 - bw / 2 + 4;
          var ry = vy + v * 34;
          var sw = this.keep(this.add.image(vx + 8, ry, 'white'));
          sw.setDisplaySize(12, 22).setTint(vt.accent).setDepth(110);
          this.keep(txt(this, vx + 24, ry, vt.name, 13, '#C7D6E8', '700', 0, 0.5));
          this.keep(txt(this, W / 2 + bw / 2 - 8, ry, pr.done + '/' + pr.total,
            13, '#7E93AC', '700', 1, 0.5));
        }

        var roomY = Math.min(H - ins.bottom - 108, vy + FZ.VATS.length * 34 + 26);
        this.btns.add({
          x: W / 2, y: roomY, w: Math.min(220, W - 64), h: 48,
          icon: 'ic_cap', iconSize: 20, iconX: W / 2 - 76,
          label: 'Open vat room', labelX: W / 2 - 48, labelSize: 14,
          onTap: function () { self.scene.start('tank'); }
        });

        /* icon controls hug the corners, out of the reading path */
        var cy = H - ins.bottom - 46;
        this.btns.add({
          x: 40 + ins.left, y: cy, w: 56, h: 56, icon: 'ic_gear', iconSize: 26,
          onTap: function () { kit.openSettings(); }
        });
        this.btns.add({
          x: W - 40 - ins.right, y: cy, w: 56, h: 56, icon: 'ic_sound', iconSize: 26,
          onTap: function () { kit.audio.setMute(!kit.audio.prefs.mute); }
        });
        this.keep(txt(this, W / 2, cy + 2, 'Original game. No lives, no gates.', 12, '#6E8299', '600'));
      },

      buildLadder: function () {
        var self = this, W = this.scale.width, H = this.scale.height;
        var top = this.titleBlock('Fizzlift ladder', '20 levels across 4 vats');
        var ins = FZ.safeInsets();

        var cols = 4;
        var cw = Math.min(78, (W - 40) / cols);
        var ch = 62;
        var gx = (W - cols * cw) / 2 + cw / 2;
        var rowsN = Math.ceil(FZ.LEVELS.length / cols);
        var gy = top + 34;
        var vatShown = -1;

        for (var i = 0; i < FZ.LEVELS.length; i++) {
          var lv = FZ.LEVELS[i];
          var r = (i / cols) | 0, c = i % cols;
          var bx = gx + c * cw, by = gy + r * (ch + 12);
          var unlocked = i < SAVE.unlocked;
          var tier = SAVE.stars[String(i)] | 0;
          (function (idx, open) {
            /* A locked tile shows the lock ONLY. Drawing the number under the
               lock glyph rendered them on top of each other. */
            self.btns.add({
              x: bx, y: by, w: cw - 8, h: ch, enabled: open,
              pri: open && idx === Math.min(SAVE.unlocked - 1, FZ.LEVELS.length - 1),
              label: open ? String(idx + 1) : null, labelSize: 18, labelY: by - 8,
              icon: open ? null : 'ic_lock', iconSize: 22, iconY: by,
              badge: open ? 'medal' + tier : null, badgeSize: 22, badgeY: by + 16,
              onTap: function () { self.scene.start('play', { mode: 'ladder', level: idx, round: 0 }); }
            });
          })(i, unlocked);
          if (lv.vat !== vatShown && c === 0) vatShown = lv.vat;
        }

        /* vat legend: which identity each block of five belongs to */
        var legY = gy + rowsN * (ch + 12) + 12;
        var legW = Math.min(344, W - 32);
        var colW = legW / 2;
        var legX = (W - legW) / 2;
        for (var v = 0; v < FZ.VATS.length; v++) {
          var vt = FZ.vat(v);
          var pr = FZ.vatProgress(SAVE, v);
          var lx = legX + (v % 2) * colW;
          var ly = legY + ((v / 2) | 0) * 46;
          var sw = this.keep(this.add.image(lx + 6, ly, 'white'));
          sw.setDisplaySize(10, 28).setTint(vt.accent).setDepth(110);
          this.keep(txt(this, lx + 20, ly - 8, vt.name, 12, '#DCE7F4', '700', 0, 0.5));
          this.keep(txt(this, lx + 20, ly + 9, pr.done + '/' + pr.total + ' cleared', 12, '#8FA3BA', '600', 0, 0.5));
        }

        this.btns.add({
          x: 40 + ins.left, y: H - ins.bottom - 46, w: 56, h: 56, icon: 'ic_back', iconSize: 26,
          onTap: function () { self.show('home'); }
        });
      },

      buildRush: function () {
        var self = this, W = this.scale.width, H = this.scale.height;
        var top = this.titleBlock('Seal Rush', 'Dense manifolds. Every seal pays moves back.');
        var ins = FZ.safeInsets();
        var bw = Math.min(320, W - 48);
        var y = top + 26;

        for (var i = 0; i < FZ.RUSH.length; i++) {
          var lvl = FZ.RUSH[i];
          var open = FZ.rushUnlocked(i, SAVE);
          var tier = SAVE.rush[String(i)] | 0;
          var vt = FZ.vat(lvl.vat);
          (function (idx, isOpen, cfg, vv, ty) {
            var b = self.btns.add({
              x: W / 2, y: ty, w: bw, h: 60, enabled: isOpen,
              icon: isOpen ? 'ic_seal' : 'ic_lock', iconSize: 24, iconX: W / 2 - bw / 2 + 32,
              label: cfg.name, labelX: W / 2 - bw / 2 + 60, labelSize: 15, labelY: ty - 9,
              onTap: function () { self.scene.start('play', { mode: 'rush', level: idx, round: 0 }); }
            });
            if (b.label) b.label.setOrigin(0, 0.5);
            var subTxt = isOpen ? (cfg.seals + ' seals   ' + cfg.moves + ' moves   ' + vv.name)
                                : FZ.rushLockText(idx, SAVE);
            var st = self.keep(txt(self, W / 2 - bw / 2 + 60, ty + 12, subTxt, 12, '#8FA3BA', '600', 0, 0.5));
            st.setDepth(122);
            var md = self.keep(self.add.image(W / 2 + bw / 2 - 28, ty, 'medal' + tier));
            md.setDisplaySize(30, 30).setDepth(122);
            if (!isOpen) md.setAlpha(0.4);
          })(i, open, lvl, vt, y);
          y += 68;
        }

        this.btns.add({
          x: 40 + ins.left, y: H - ins.bottom - 46, w: 56, h: 56, icon: 'ic_back', iconSize: 26,
          onTap: function () { self.show('home'); }
        });
      }
    }
  };

  /* ===================================================== VAT ROOM ==== */
  var TankScene = {
    key: 'tank',

    create: function () {
      var self = this;
      FZ_STATE.scene = 'tank';
      FZ_STATE.mode = 'menu';
      FZ_STATE.phase = 'meta';
      this.btns = new Buttons(this);
      this.bridge = new PointerBridge(this);
      this.parts = [];
      this.bg = this.add.image(0, 0, 'backdrop').setOrigin(0, 0).setDepth(0);
      this.scale.on('resize', this.relayout, this);
      this.events.once('shutdown', function () { self.scale.off('resize', self.relayout, self); });
      this.relayout();
      kit.audio.music('music_vat', 700);
    },

    update: function () {
      var self = this;
      if (kit.paused) return;
      this.bridge.poll(
        function (id, x, y) { self.btns.onDown(x, y); },
        null,
        function (id, x, y) { self.btns.onUp(x, y); }
      );
      var esc = kit.input.keyDown('Escape');
      if (esc && !this.escPrev) this.leave();
      this.escPrev = esc;
    },

    extend: {
      relayout: function () {
        var W = this.scale.width, H = this.scale.height;
        this.bg.setTexture('backdrop').setDisplaySize(W, H);
        FZ.art.bakeVat(this, FZ.vat(0), W, H);
        this.bridge.refreshRect();
        this.wipe();
        this.buildRoom(W, H);
      },

      wipe: function () {
        this.btns.clear();
        for (var i = 0; i < this.parts.length; i++) if (this.parts[i]) this.parts[i].destroy();
        this.parts.length = 0;
      },

      keep: function (obj) { this.parts.push(obj); return obj; },

      buildRoom: function (W, H) {
        var self = this, ins = FZ.safeInsets();
        var top = ins.top + 46;
        this.keep(txt(this, W / 2, top, 'Vat room', 28, '#F7FBFF', '800'));
        this.keep(txt(this, W / 2, top + 28, 'Saved restoration states', 14, '#9DB2C8', '600'));

        var progress = FZ.metaProgress(SAVE);
        this.keep(txt(this, W / 2, top + 66,
          progress.doneVats + '/' + progress.totalVats + ' vats restored', 15, '#DCE7F4', '700'));

        var panelW = Math.min(344, W - 32);
        var panelY = top + 286;
        var panelH = Math.min(430, Math.max(320, H - panelY - ins.bottom - 94));
        var panel = this.keep(this.add.image(W / 2, panelY, 'banner'));
        panel.setDisplaySize(panelW, panelH).setTint(FZ.vat(Math.min(progress.doneVats, 3)).glass).setAlpha(0.90).setDepth(10);

        var tankY = top + 158;
        var tank = this.keep(this.add.image(W / 2, tankY + 54, 'fizzbody'));
        tank.setDisplaySize(Math.min(230, W - 100), 130).setTint(FZ.vat(Math.min(progress.doneVats, 3)).fizz).setAlpha(0.78).setDepth(11);
        var bar = this.keep(this.add.image(W / 2, tankY, 'fizzbar'));
        bar.setDisplaySize(Math.min(250, W - 84), 20).setTint(FZ.vat(Math.min(progress.doneVats, 3)).foam).setDepth(12);
        var cap = this.keep(this.add.image(W / 2, tankY - 32, 'cap'));
        cap.setDisplaySize(50, 50).setDepth(13);

        var names = ['Dry frame', 'Sunfizz restored', 'Deepfizz pressure live',
          'Waveline stocked', 'Overflow crown complete'];
        var stateTop = top + 222;
        for (var s = 0; s < names.length; s++) {
          var open = s === 0 || s <= progress.doneVats;
          var sy = stateTop + s * 42;
          var ico = this.keep(this.add.image(W / 2 - panelW / 2 + 30, sy, open ? 'cap' : 'ic_lock'));
          ico.setDisplaySize(open ? 22 : 20, open ? 22 : 20).setAlpha(open ? 1 : 0.42).setDepth(13);
          this.keep(txt(this, W / 2 - panelW / 2 + 50, sy, 'State ' + s + '  ' + names[s],
            13, open ? '#E7EEF7' : '#7E8DA3', open ? '700' : '600', 0, 0.5)).setDepth(13);
        }

        this.btns.add({
          x: 40 + ins.left, y: H - ins.bottom - 46, w: 56, h: 56, icon: 'ic_back', iconSize: 26,
          onTap: function () { self.leave(); }
        });
        this.keep(txt(this, W / 2, H - ins.bottom - 46,
          'Clear a vat to restore its room state.', 12, '#8FA3BA', '600'));
      },

      leave: function () { this.scene.start('menu', { view: 'home' }); }
    }
  };

  /* ==================================================== PLAY SCENE ==== */
  var PlayScene = {
    key: 'play',

    init: function (data) {
      this.mode = (data && data.mode) || 'ladder';
      this.level = (data && data.level) | 0;
      this.round = (data && data.round) | 0;
      this.boardReady = false;
    },

    create: function () {
      var self = this;
      FZ_STATE.scene = 'play';
      this.btns = new Buttons(this);
      this.bridge = new PointerBridge(this);
      this.views = {};          /* cell id -> view record */
      this.viewPool = [];
      this.pendingSpawn = {};
      this.gen = 0;
      this.frozen = false;
      this.pauseMode = false;
      this.musicDuck = null;

      this.bg = this.add.image(0, 0, 'backdrop').setOrigin(0, 0).setDepth(0);
      this.frame = this.add.image(0, 0, 'boardframe').setOrigin(0.5, 0.5).setDepth(4);

      /* fizz body + surface bar: one pair of images per column, never a
         Graphics redraw */
      this.fizzBody = [];
      this.fizzGlaze = [];
      this.fizzBar = [];
      for (var c = 0; c < COLS; c++) {
        var body = this.add.image(0, 0, 'fizzbody').setOrigin(0.5, 0).setDepth(8);
        /* the glaze rides OVER the pieces: which side of the line a piece sits
           on has to be readable in a single frame */
        var glaze = this.add.image(0, 0, 'fizzglaze').setOrigin(0.5, 0).setDepth(30);
        var bar = this.add.image(0, 0, 'fizzbar').setOrigin(0.5, 0.5).setDepth(33);
        bar.setBlendMode(Phaser.BlendModes.ADD);
        this.fizzBody.push(body);
        this.fizzGlaze.push(glaze);
        this.fizzBar.push(bar);
      }
      /* persistent directional markers at both ends of the line: float above,
         fall below, stated as icons rather than words */
      this.markUp = this.add.image(-999, -999, 'arrUp').setDepth(34).setVisible(false);
      this.markDn = this.add.image(-999, -999, 'arrDn').setDepth(34).setVisible(false);
      this.lineY = new Float32Array(COLS);
      this.lineTarget = new Float32Array(COLS);

      /* piece image pool */
      for (var i = 0; i < COLS * ROWS + 20; i++) {
        var img = this.add.image(-999, -999, 'p0').setDepth(20).setVisible(false);
        this.viewPool.push(img);
      }

      /* selector, ghost, direction arrows */
      this.sel = this.add.image(-999, -999, 'sel').setDepth(40).setVisible(false);
      this.ghost = this.add.image(-999, -999, 'ghost').setDepth(42).setVisible(false);
      this.nogo = this.add.image(-999, -999, 'nogo').setDepth(41).setVisible(false);
      this.arrUp = this.add.image(-999, -999, 'arrUp').setDepth(41).setVisible(false).setAlpha(0.9);
      this.arrDn = this.add.image(-999, -999, 'arrDn').setDepth(41).setVisible(false).setAlpha(0.9);
      this.hintA = this.add.image(-999, -999, 'sel').setDepth(18).setVisible(false).setAlpha(0.5);
      this.hintB = this.add.image(-999, -999, 'sel').setDepth(18).setVisible(false).setAlpha(0.5);
      this.rim = this.add.image(-999, -999, 'px_ring').setDepth(45).setVisible(false)
        .setBlendMode(Phaser.BlendModes.ADD);

      /* the three pooled particle systems */
      var reduced = !kit.juice.enabled;
      this.pFrag = new Pool(this, 'px_frag', reduced ? 10 : 16, 50, false);
      this.pTrail = new Pool(this, 'px_bub', reduced ? 10 : 16, 49, true);
      this.pReward = new Pool(this, 'px_star', reduced ? 10 : 14, 51, true);

      this.buildHud();
      this.buildControls();
      this.buildTransients();

      this.scale.on('resize', this.relayout, this);
      this.events.once('shutdown', function () {
        self.scale.off('resize', self.relayout, self);
        self.pFrag.reset(); self.pTrail.reset(); self.pReward.reset();
        self.restoreMusic();
      });

      this.startLevel(true);
      this.relayout();
    },

    update: function (time, delta) {
      /* Clamped frame time. A slow device runs the resolution in slow motion;
         it never advances a clock past the stepped simulation. */
      var dt = Math.min(delta, 50) / 1000;
      if (kit.paused || this.frozen) {
        this.pollButtonsOnly();
        return;
      }
      var juiceFrame = kit.juice.frame();
      if (juiceFrame.frozen) {
        this.cameras.main.setScroll(-juiceFrame.dx, -juiceFrame.dy);
        return;
      }
      this.checkForceSwitches();
      this.readInput();
      this.stepPhase(dt);
      this.animate(dt);
      this.pFrag.update(dt);
      this.pTrail.update(dt);
      this.pReward.update(dt);
      this.updateHud(dt);
      this.updateTransients(dt);
      this.publish();
    },

    extend: {

      /* --------------------------------------------------- lifecycle */
      freeze: function () { this.frozen = true; },
      thaw: function () { this.frozen = false; if (this.bridge) this.bridge.clear(); },

      startLevel: function (fresh) {
        /* Cancel every pending delayed call first. A results-screen button
           build, a vat-complete beat or a hint timeout scheduled by the run
           that just ended would otherwise fire on top of the NEW level and
           paste Retry/Next over a live board. */
        this.restoreMusic();
        if (this.time) this.time.removeAllEvents();
        this.cfg = FZ.configFor(this.mode, this.level, this.round);
        this.vat = FZ.vat(this.cfg.vat);
        this.board = FZ.makeBoard(this.cfg);
        this.moves = this.cfg.moves | 0;
        this.movesUsed = 0;
        this.chain = 0;
        this.phase = 'intro';
        this.timer = 0;
        this.selR = -1; this.selC = -1;
        this.selState = 'ready';
        this.selPose = 0;
        this.dragId = null;
        this.dragFrom = null;
        this.dragTo = null;
        this.tapR = -1; this.tapC = -1;
        this.keyAnchor = null;
        this.keyPrev = {};
        this.idleT = 0;
        this.hint = null;
        this.runScore = (this.mode === 'endless' && !fresh) ? this.runScore : 0;
        this.medal = 0;
        FZ_STATE.medal = 0;
        this.boardReady = true;
        this.releaseAllViews();
        this.syncLine(true);
        if (fresh !== false) {
          this.bakeVatArt();
          kit.audio.music(this.mode === 'rush' ? 'music_rush' : 'music_vat', 800);
        }
        var vatName = this.vat.name;
        var title = this.mode === 'endless'
          ? 'Endless Fizz'
          : (this.mode === 'rush' ? 'Seal Rush' : 'Level ' + (this.level + 1));
        this.banner(title, this.cfg.name + '  ·  ' + vatName, 1500, this.vat.accent);
        var coachKey = this.coachKey();
        if (!SAVE.seen[coachKey]) {
          SAVE.seen[coachKey] = true;
          persist();
          this.coach(this.coachLine());
        }
        /* restore the standard corner controls: a restart straight from the
           results screen must not keep Retry/Next on a live board */
        if (this.ins) this.layoutControls(this.scale.width, this.scale.height, this.ins);
        this.publish();
      },

      coachLine: function () {
        if (this.mode === 'endless') return 'Every surfaced cap pays back 2 moves.';
        if (this.mode === 'rush') return 'Clear beside a seal to crack it. Broken seals lift the line.';
        if (this.level === 0) return 'Tap two neighbours or swipe. Match 3. Fizz floats up.';
        if (this.level === 1) return 'Float every cap to the glowing surface line.';
        if (this.level === 2) return 'Clear next to a seal twice to break it open.';
        if (this.cfg.wave > 0 && this.level <= 4) return 'The line waves as you play. Watch which side a piece is on.';
        return this.cfg.caps + ' caps, ' + this.cfg.seals + ' seals. ' +
          (this.cfg.refund > 1 ? 'Each cap pays back ' + this.cfg.refund + ' moves.' : 'Each cap pays a move back.');
      },

      coachKey: function () {
        if (this.mode === 'endless') return 'coach-endless';
        return 'coach-' + this.mode + '-' + this.level;
      },

      restartLevel: function () {
        this.bridge.clear();
        this.clearTransients();
        if (this.mode === 'endless') { this.round = 0; this.runScore = 0; }
        this.startLevel(true);
      },

      duckMusic: function () {
        if (this.musicDuck !== null) return;
        this.musicDuck = kit.audio.prefs.music;
        kit.audio.setMusicVolume(this.musicDuck * 0.38);
      },

      restoreMusic: function () {
        if (this.musicDuck === null) return;
        kit.audio.setMusicVolume(this.musicDuck);
        this.musicDuck = null;
      },

      bakeVatArt: function () {
        FZ.art.bakeVat(this, this.vat, this.scale.width, this.scale.height);
        this.bg.setTexture('backdrop');
        this.bg.setDisplaySize(this.scale.width, this.scale.height);
        for (var c = 0; c < COLS; c++) {
          this.fizzBody[c].setTexture('fizzbody');
          this.fizzGlaze[c].setTexture('fizzglaze');
          this.fizzBar[c].setTexture('fizzbar');
        }
      },

      /* ---------------------------------------------------- geometry */
      relayout: function () {
        var W = this.scale.width, H = this.scale.height;
        var ins = FZ.safeInsets();
        this.ins = ins;
        this.bridge.refreshRect();

        var hudTop = ins.top + 8;
        var hudH = 46;
        this.stripY = hudTop + hudH + 14;
        var boardTop = this.stripY + 22;
        var bottomH = 76 + ins.bottom;
        var availH = Math.max(120, H - boardTop - bottomH);
        var availW = Math.max(120, W - 20 - ins.left - ins.right);

        var cell = Math.floor(Math.min((availW - 26) / COLS, (availH - 26) / ROWS));
        cell = FZ.clamp(cell, 22, 68);
        var pad = FZ.clamp(Math.round(cell * 0.26), 8, 18);
        this.cell = cell; this.pad = pad;

        var bw = COLS * cell + pad * 2, bh = ROWS * cell + pad * 2;
        this.boardW = bw; this.boardH = bh;
        this.bx = Math.round((W - bw) / 2) + pad;
        this.by = Math.round(boardTop + (availH - bh) / 2) + pad;
        if (this.by < boardTop) this.by = boardTop + pad;

        var geo = FZ.art.bakeBoard(this, this.vat, { pad: pad, cell: cell, cols: COLS, rows: ROWS });
        this.frame.setTexture('boardframe');
        this.frame.setDisplaySize(geo.w, geo.h);
        this.frame.setPosition(this.bx - pad + geo.w / 2, this.by - pad + geo.h / 2);

        FZ.art.bakeBackdrop(this, this.vat, W, H);
        this.bg.setTexture('backdrop');
        this.bg.setDisplaySize(W, H);

        this.layoutHud(W, H, ins, hudTop, hudH);
        this.layoutControls(W, H, ins);
        this.layoutTransients(W, H);
        this.syncLine(true);
      },

      cx: function (c) { return this.bx + c * this.cell + this.cell / 2; },
      cy: function (r) { return this.by + r * this.cell + this.cell / 2; },
      cellAt: function (x, y) {
        var c = Math.floor((x - this.bx) / this.cell);
        var r = Math.floor((y - this.by) / this.cell);
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
        return { r: r, c: c };
      },

      /* -------------------------------------------------------- HUD */
      buildHud: function () {
        this.hud = {};
        var mk = function (scene, icon) {
          var o = {};
          o.plate = scene.add.image(0, 0, 'chip').setDepth(100);
          o.icon = scene.add.image(0, 0, icon).setDepth(101);
          o.val = txt(scene, 0, 0, '0', 18, '#F7FBFF', '800');
          o.val.setDepth(101);
          return o;
        };
        this.hud.moves = mk(this, 'ic_move');
        this.hud.caps = mk(this, 'ic_cap');
        this.hud.seals = mk(this, 'ic_seal');
        this.hud.score = mk(this, 'ic_score');
        this.hudCache = { moves: -1, caps: '', seals: '', score: -1, hot: false };
      },

      layoutHud: function (W, H, ins, top, h) {
        var showScore = (this.mode === 'endless');
        var chips = showScore ? ['moves', 'caps', 'score'] : ['moves', 'caps', 'seals'];
        var side = 52;
        var left = ins.left + side, right = W - ins.right - side;
        var span = right - left;
        var cw = Math.min(104, (span - 16) / chips.length);
        var startX = left + (span - cw * chips.length - 8 * (chips.length - 1)) / 2 + cw / 2;
        var all = ['moves', 'caps', 'seals', 'score'], i;
        for (i = 0; i < all.length; i++) {
          var vis = chips.indexOf(all[i]) >= 0;
          var o = this.hud[all[i]];
          o.plate.setVisible(vis); o.icon.setVisible(vis); o.val.setVisible(vis);
        }
        for (i = 0; i < chips.length; i++) {
          var o2 = this.hud[chips[i]];
          var x = startX + i * (cw + 8), y = top + h / 2;
          o2.plate.setPosition(x, y).setDisplaySize(cw, h);
          o2.icon.setPosition(x - cw / 2 + 22, y).setDisplaySize(20, 20);
          o2.val.setPosition(x - cw / 2 + 38, y).setOrigin(0, 0.5);
          o2.val.setFontSize(chips[i] === 'score' ? 15 : 18);
        }
        this.hudY = top + h;
        this.chipRow = { left: left, right: right, y: top + h / 2, cw: cw };
      },

      updateHud: function () {
        var b = this.board;
        if (!b) return;
        var mv = Math.max(0, this.moves);
        if (mv !== this.hudCache.moves) {
          this.hudCache.moves = mv;
          FZ.setTextIfChanged(this.hud.moves.val, String(mv));
          var hot = mv <= 5;
          if (hot !== this.hudCache.hot) {
            this.hudCache.hot = hot;
            this.hud.moves.plate.setTexture(hot ? 'chipHot' : 'chip');
            this.hud.moves.plate.setDisplaySize(this.chipRow.cw, 46);
          }
        }
        var capStr = (this.cfg.caps >= 9999)
          ? String(b.capsOut)
          : (b.capsOut + '/' + this.cfg.caps);
        if (capStr !== this.hudCache.caps) {
          this.hudCache.caps = capStr;
          FZ.setTextIfChanged(this.hud.caps.val, capStr);
        }
        var sealStr = String(b.sealsLeft);
        if (sealStr !== this.hudCache.seals) {
          this.hudCache.seals = sealStr;
          FZ.setTextIfChanged(this.hud.seals.val, sealStr);
        }
        var sc = this.score();
        if (sc !== this.hudCache.score) {
          this.hudCache.score = sc;
          FZ.setTextIfChanged(this.hud.score.val, String(sc));
        }
      },

      score: function () {
        return (this.runScore | 0) + (this.board ? this.board.score : 0);
      },

      /* --------------------------------------------------- controls */
      buildControls: function () { /* rack is rebuilt on layout */ },

      layoutControls: function (W, H, ins) {
        var self = this;
        this.btns.clear();
        var y = H - ins.bottom - 44;
        if (this.pauseMode) {
          this.addResumeButton(W, H);
          return;
        }
        /* corners only: the middle of the thumb row stays empty */
        this.btns.add({
          x: 44 + ins.left, y: y, w: 60, h: 60, icon: 'ic_back', iconSize: 26,
          onTap: function () { self.leave(); }
        });
        this.btns.add({
          x: 44 + ins.left + 70, y: y, w: 60, h: 60, icon: 'ic_retry', iconSize: 26,
          onTap: function () { self.restartLevel(); }
        });
        this.btns.add({
          x: W - 44 - ins.right - 70, y: y, w: 60, h: 60, icon: 'ic_gear', iconSize: 26,
          onTap: function () { kit.openSettings(); }
        });
        this.btns.add({
          x: W - 44 - ins.right - 140, y: y, w: 60, h: 60, icon: 'ic_info', iconSize: 26,
          onTap: function () { self.showHint(true); }
        });
        this.btns.add({
          x: W - 44 - ins.right, y: y, w: 60, h: 60, icon: 'ic_pause', iconSize: 26,
          onTap: function () { self.pauseGame(); }
        });
      },

      addResumeButton: function (W, H) {
        var self = this;
        this.btns.add({
          x: W / 2, y: Math.min(H - (this.ins ? this.ins.bottom : 0) - 70, H * 0.60),
          w: 180, h: 60, pri: true, icon: 'ic_play', iconSize: 24,
          iconX: W / 2 - 58, label: 'Resume', labelX: W / 2 + 12,
          onTap: function () { self.resumeGame(); }
        });
      },

      pauseGame: function () {
        if (kit.paused || this.pauseMode) return;
        this.pauseMode = true;
        this.pauseT.plate.setVisible(true);
        this.pauseT.icon.setVisible(true);
        this.pauseT.title.setVisible(true);
        this.pauseT.sub.setVisible(true);
        this.layoutPause(this.scale.width, this.scale.height);
        this.layoutControls(this.scale.width, this.scale.height, this.ins || FZ.safeInsets());
        /* GGKit deliberately stops pointer collection while kit.paused is true.
           Keep this in-canvas resume button reachable through GGKit input by
           using the scene freeze hook for the manual pause. Visibility and
           settings pauses still use GGKit's lifecycle pause path. */
        this.freeze();
      },

      resumeGame: function () {
        if (!this.pauseMode) return;
        this.pauseMode = false;
        this.pauseT.plate.setVisible(false);
        this.pauseT.icon.setVisible(false);
        this.pauseT.title.setVisible(false);
        this.pauseT.sub.setVisible(false);
        this.thaw();
        this.layoutControls(this.scale.width, this.scale.height, this.ins || FZ.safeInsets());
      },

      layoutPause: function (W, H) {
        var p = this.pauseT;
        p.plate.setPosition(W / 2, H * 0.46).setDisplaySize(Math.min(300, W - 40), 190);
        p.icon.setPosition(W / 2, H * 0.36).setDisplaySize(42, 42);
        p.title.setPosition(W / 2, H * 0.43);
        p.sub.setPosition(W / 2, H * 0.50);
      },

      leave: function () {
        this.clearTransients();
        this.scene.start('menu', {
          view: this.mode === 'rush' ? 'rush' : (this.mode === 'ladder' ? 'ladder' : 'home'),
          vat: this.cfg ? this.cfg.vat : 0
        });
      },

      /* -------------------------------------------------- transients */
      /* One transient at a time. In-play events become a small chip pinned
         under the HUD; centre banners are reserved for run boundaries. */
      buildTransients: function () {
        this.chipT = {
          plate: this.add.image(-999, -999, 'chip').setDepth(150).setVisible(false),
          icon: this.add.image(-999, -999, 'ic_cap').setDepth(151).setVisible(false),
          label: txt(this, -999, -999, '', 14, '#F7FBFF', '750').setDepth(151).setVisible(false),
          t: 0, ttl: 0
        };
        this.bannerT = {
          plate: this.add.image(-999, -999, 'banner').setDepth(160).setVisible(false),
          title: txt(this, -999, -999, '', 22, '#F7FBFF', '800').setDepth(161).setVisible(false),
          sub: txt(this, -999, -999, '', 13, '#9DB2C8', '650').setDepth(161).setVisible(false),
          t: 0, ttl: 0, tint: 0xffffff
        };
        this.coachT = {
          bar: this.add.image(-999, -999, 'white').setDepth(155).setVisible(false).setAlpha(0.10),
          label: txt(this, -999, -999, '', 14, '#DCE7F4', '600').setDepth(156).setVisible(false),
          t: 0, ttl: 0
        };
        this.medalT = this.add.image(-999, -999, 'medal3').setDepth(162).setVisible(false);
        this.pauseT = {
          plate: this.add.image(-999, -999, 'banner').setDepth(170).setVisible(false),
          icon: this.add.image(-999, -999, 'ic_pause').setDepth(171).setVisible(false),
          title: txt(this, -999, -999, 'Paused', 24, '#F7FBFF', '800').setDepth(171).setVisible(false),
          sub: txt(this, -999, -999, 'Your board is waiting.', 14, '#BFD4E8', '600').setDepth(171).setVisible(false)
        };
      },

      layoutTransients: function (W, H) {
        this.chipT.y = this.hudY + 26;
        this.bannerT.x = W / 2;
        this.bannerT.y = Math.round(H * 0.42);
        this.bannerT.w = Math.round(W * 0.60);
        /* wrap inside the 60 percent plate rather than overrunning it */
        this.bannerT.title.setWordWrapWidth(this.bannerT.w - 26);
        this.bannerT.title.setAlign('center');
        this.bannerT.sub.setWordWrapWidth(this.bannerT.w - 26);
        this.bannerT.sub.setAlign('center');
        this.coachT.y = this.stripY;
        this.coachT.w = W - 24;
        if (this.pauseMode) this.layoutPause(W, H);
      },

      clearTransients: function () {
        this.chipT.ttl = 0; this.bannerT.ttl = 0; this.coachT.ttl = 0;
        this.chipT.plate.setVisible(false); this.chipT.icon.setVisible(false); this.chipT.label.setVisible(false);
        this.bannerT.plate.setVisible(false); this.bannerT.title.setVisible(false); this.bannerT.sub.setVisible(false);
        this.coachT.bar.setVisible(false); this.coachT.label.setVisible(false);
        this.medalT.setVisible(false);
        this.pauseT.plate.setVisible(false); this.pauseT.icon.setVisible(false);
        this.pauseT.title.setVisible(false); this.pauseT.sub.setVisible(false);
        this.queuedCoach = null;
      },

      /* corner chip: max ~24px text, 1.0s hold, replaces any live chip */
      toast: function (icon, label, tint) {
        var c = this.chipT;
        c.icon.setTexture(icon);
        FZ.setTextIfChanged(c.label, label);
        FZ.setTintIfChanged(c.icon, tint === undefined ? 0xffffff : tint);
        c.t = 0; c.ttl = 1.0;
        c.plate.setVisible(true); c.icon.setVisible(true); c.label.setVisible(true);
      },

      /* centre banner: run boundaries only */
      banner: function (title, sub, ms, tint) {
        var b = this.bannerT;
        FZ.setTextIfChanged(b.title, title);
        FZ.setTextIfChanged(b.sub, sub || '');
        b.tint = tint === undefined ? 0xffffff : tint;
        b.t = 0; b.ttl = (ms || 1400) / 1000;
        b.plate.setVisible(true); b.title.setVisible(true);
        b.sub.setVisible(!!sub);
        /* Rule 1, one transient at a time: a banner takes the stage, so any
           live chip stands down. Zeroing the timer is not enough - the fade
           branch stops running and would leave the chip painted on screen. */
        this.chipT.ttl = 0;
        this.chipT.plate.setVisible(false);
        this.chipT.icon.setVisible(false);
        this.chipT.label.setVisible(false);
        this.coachT.ttl = 0;
        this.coachT.bar.setVisible(false);
        this.coachT.label.setVisible(false);
        this.queuedCoach = null;
      },

      /* thin fading coach strip at the top edge, one line, never centred */
      coach: function (line) {
        if (!line) return;
        if (this.bannerT.ttl > 0) {
          this.queuedCoach = line;
          return;
        }
        var c = this.coachT;
        FZ.setTextIfChanged(c.label, line);
        c.t = 0; c.ttl = 3.4;
        c.bar.setVisible(true); c.label.setVisible(true);
      },

      updateTransients: function (dt) {
        var live = 0;

        var c = this.chipT;
        if (c.ttl > 0) {
          c.t += dt;
          var k = c.t / c.ttl;
          if (k >= 1) {
            c.ttl = 0;
            c.plate.setVisible(false); c.icon.setVisible(false); c.label.setVisible(false);
          } else {
            live++;
            var a = k < 0.12 ? k / 0.12 : (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
            var wpx = 44 + c.label.width;
            var x = this.scale.width / 2;
            c.plate.setPosition(x, c.y).setDisplaySize(wpx, 34).setAlpha(a);
            c.icon.setPosition(x - wpx / 2 + 20, c.y).setDisplaySize(18, 18).setAlpha(a);
            c.label.setPosition(x - wpx / 2 + 34, c.y).setOrigin(0, 0.5).setAlpha(a);
          }
        }

        var b = this.bannerT;
        if (b.ttl > 0) {
          b.t += dt;
          var kb = b.t / b.ttl;
          if (kb >= 1) {
            b.ttl = 0;
            b.plate.setVisible(false); b.title.setVisible(false); b.sub.setVisible(false);
            this.medalT.setVisible(false);
            if (this.queuedCoach) {
              var queued = this.queuedCoach;
              this.queuedCoach = null;
              this.coach(queued);
            }
          } else {
            live++;
            var inK = FZ.clamp(b.t / 0.26, 0, 1);
            var pop = kit.juice.enabled ? FZ.easeOutBack(inK) : FZ.easeOutCubic(inK);
            var ab = kb > 0.82 ? 1 - (kb - 0.82) / 0.18 : 1;
            var bwv = b.w * (0.86 + 0.14 * pop);
            /* the plate grows to whatever the wrapped copy actually needs, so
               a long medal line can never spill past its own banner */
            var need = 34 + b.title.height + (b.sub.visible ? b.sub.height + 6 : 0);
            var bhv = Math.max(bwv * 0.30, need);
            b.plate.setPosition(b.x, b.y).setDisplaySize(bwv, bhv).setAlpha(ab);
            b.plate.setTint(FZ.mix(0xffffff, b.tint, 0.35));
            var topY = b.y - bhv / 2 + 17;
            b.title.setPosition(b.x, topY + b.title.height / 2).setAlpha(ab);
            b.sub.setPosition(b.x, topY + b.title.height + 6 + b.sub.height / 2).setAlpha(ab);
            if (this.medalT.visible) {
              this.medalT.setPosition(b.x, b.y - bhv * 0.72).setDisplaySize(52, 52).setAlpha(ab);
            }
          }
        }

        var t = this.coachT;
        if (t.ttl > 0) {
          live++;
          t.t += dt;
          var kc = t.t / t.ttl;
          if (kc >= 1) {
            t.ttl = 0;
            t.bar.setVisible(false); t.label.setVisible(false);
          } else {
            var ac = kc < 0.08 ? kc / 0.08 : (kc > 0.62 ? Math.max(0.06, 1 - (kc - 0.62) / 0.38) : 1);
            t.bar.setPosition(this.scale.width / 2, t.y).setDisplaySize(t.w, 26).setAlpha(0.14 * ac);
            t.label.setPosition(this.scale.width / 2, t.y).setAlpha(ac);
          }
        }
        FZ_STATE.transients = live;
      },

      /* ------------------------------------------------------- input */
      pollButtonsOnly: function () {
        var self = this;
        this.bridge.poll(
          function (id, x, y) { self.btns.onDown(x, y); },
          null,
          function (id, x, y) { self.btns.onUp(x, y); }
        );
      },

      readInput: function () {
        var self = this;
        this.bridge.poll(
          function (id, x, y) { self.onDown(id, x, y); },
          function (id, x, y, sx, sy) { self.onMove(id, x, y, sx, sy); },
          function (id, x, y, sx, sy) { self.onUp(id, x, y, sx, sy); }
        );
        this.readKeys();
      },

      onDown: function (id, x, y) {
        if (this.btns.onDown(x, y)) return;
        if (this.phase !== 'idle') return;
        var at = this.cellAt(x, y);
        if (!at) return;
        /* A pointer begins a fresh touch interaction, not a keyboard swap. */
        this.keyAnchor = null;
        this.dragId = id;
        this.dragFrom = at;
        this.dragMoved = false;
        this.selR = at.r; this.selC = at.c;
        this.selState = 'preview';
        this.idleT = 0;
        this.hideHint();
        kit.audio.sfx('sfx_select', { volume: 0.5 });
      },

      onMove: function (id, x, y, sx, sy) {
        if (this.dragId !== id || this.phase !== 'idle') return;
        var dx = x - sx, dy = y - sy;
        var mag = Math.max(Math.abs(dx), Math.abs(dy));
        if (mag < this.cell * 0.30) { this.hideGhost(); return; }
        var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? [0, 1] : [0, -1]) : (dy > 0 ? [1, 0] : [-1, 0]);
        var tr = this.dragFrom.r + dir[0], tc = this.dragFrom.c + dir[1];
        this.dragTo = (tr >= 0 && tr < ROWS && tc >= 0 && tc < COLS) ? { r: tr, c: tc } : null;
        this.showGhost();
      },

      onUp: function (id, x, y, sx, sy) {
        if (this.btns.onUp(x, y)) { this.dragId = null; return; }
        if (this.dragId !== id) return;
        this.dragId = null;
        this.hideGhost();
        if (this.phase !== 'idle') return;
        var from = this.dragFrom;
        if (!from) return;
        var dx = x - sx, dy = y - sy;
        var mag = Math.max(Math.abs(dx), Math.abs(dy));
        var to = null;
        if (mag >= this.cell * 0.30) {
          this.tapR = -1; this.tapC = -1;
          var dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? [0, 1] : [0, -1]) : (dy > 0 ? [1, 0] : [-1, 0]);
          to = { r: from.r + dir[0], c: from.c + dir[1] };
        } else {
          /* tap: first tap selects, second tap on a neighbour swaps */
          if (this.tapR >= 0 && this.tapR !== undefined &&
              Math.abs(this.tapR - from.r) + Math.abs(this.tapC - from.c) === 1) {
            to = { r: from.r, c: from.c };
            from = { r: this.tapR, c: this.tapC };
          } else {
            /* Keep the first anchor after a non-neighbour tap. This gives the
               player a stable two-tap interaction instead of silently moving
               the selection. */
            if (this.tapR < 0 || this.tapR === undefined) {
              this.tapR = from.r; this.tapC = from.c;
              this.selR = from.r; this.selC = from.c;
              this.selState = 'preview';
            } else {
              this.selR = this.tapR; this.selC = this.tapC;
              this.selState = 'preview';
            }
            return;
          }
        }
        if (!to || to.r < 0 || to.r >= ROWS || to.c < 0 || to.c >= COLS) {
          this.selState = 'ready';
          return;
        }
        var wasTap = mag < this.cell * 0.30;
        this.tapR = -1; this.tapC = -1;
        var accepted = this.trySwap(from.r, from.c, to.r, to.c);
        if (wasTap && !accepted) {
          this.tapR = from.r; this.tapC = from.c;
          this.selR = from.r; this.selC = from.c;
        }
      },

      readKeys: function () {
        var self = this;
        function edge(code, name, fn) {
          var d = kit.input.keyDown(code);
          if (d && !self.keyPrev[name]) fn();
          self.keyPrev[name] = d;
        }
        if (!this.keyPrev) this.keyPrev = {};
        edge('ArrowUp', 'up', function () { self.moveCursor(-1, 0); });
        edge('ArrowDown', 'down', function () { self.moveCursor(1, 0); });
        edge('ArrowLeft', 'left', function () { self.moveCursor(0, -1); });
        edge('ArrowRight', 'right', function () { self.moveCursor(0, 1); });
        edge('Enter', 'enter', function () { self.keySelect(); });
        edge('Space', 'space', function () { self.keySelect(); });
        edge('KeyR', 'r', function () { kit.restart(); });
        edge('KeyM', 'm', function () { kit.audio.setMute(!kit.audio.prefs.mute); });
        edge('KeyH', 'h', function () { self.showHint(true); });
        edge('Escape', 'esc', function () {
          if (self.tapR >= 0 || self.keyAnchor || self.selState === 'preview' || self.selState === 'invalid') {
            self.clearSelection();
          } else {
            self.pauseGame();
          }
        });
      },

      clearSelection: function () {
        this.tapR = -1; this.tapC = -1;
        this.keyAnchor = null;
        this.dragId = null; this.dragFrom = null;
        this.selR = -1; this.selC = -1;
        this.selState = 'ready';
        this.selPose = 0;
        this.nogoT = 0;
        this.hideGhost();
        this.nogo.setVisible(false);
      },

      moveCursor: function (dr, dc) {
        if (this.phase !== 'idle') return;
        this.tapR = -1; this.tapC = -1;
        this.dragFrom = null; this.dragTo = null;
        if (this.selR < 0) { this.selR = (ROWS / 2) | 0; this.selC = (COLS / 2) | 0; }
        else if (this.keyAnchor) {
          var anchor = this.keyAnchor;
          this.keyAnchor = null;
          this.trySwap(anchor.r, anchor.c,
            FZ.clamp(anchor.r + dr, 0, ROWS - 1), FZ.clamp(anchor.c + dc, 0, COLS - 1));
          return;
        } else {
          this.selR = FZ.clamp(this.selR + dr, 0, ROWS - 1);
          this.selC = FZ.clamp(this.selC + dc, 0, COLS - 1);
        }
        this.idleT = 0;
      },

      keySelect: function () {
        if (this.phase !== 'idle' || this.selR < 0) return;
        this.tapR = -1; this.tapC = -1;
        if (this.keyAnchor) { this.keyAnchor = null; this.selState = 'ready'; return; }
        this.keyAnchor = { r: this.selR, c: this.selC };
        this.selState = 'preview';
        kit.audio.sfx('sfx_select', { volume: 0.5 });
      },

      showGhost: function () {
        if (!this.dragTo) { this.hideGhost(); return; }
        var b = this.board;
        var a = b.g[FZ.idx(this.dragFrom.r, this.dragFrom.c)];
        var d = b.g[FZ.idx(this.dragTo.r, this.dragTo.c)];
        var legal = FZ.swappable(a) && FZ.swappable(d) &&
          FZ.testSwap(b, this.dragFrom.r, this.dragFrom.c, this.dragTo.r, this.dragTo.c);
        var gx = this.cx(this.dragTo.c), gy = this.cy(this.dragTo.r);
        if (legal) {
          this.ghost.setPosition(gx, gy).setDisplaySize(this.cell, this.cell).setVisible(true);
          this.nogo.setVisible(false);
          this.selState = 'preview';
          var vert = this.dragTo.r !== this.dragFrom.r;
          var side = this.dragTo.r >= b.bnd[this.dragTo.c] ? 1 : -1;
          var arrow = side > 0 ? this.arrUp : this.arrDn;
          var other = side > 0 ? this.arrDn : this.arrUp;
          arrow.setPosition(gx, gy).setDisplaySize(this.cell * 0.42, this.cell * 0.42)
            .setVisible(true).setTint(this.vat.foam);
          other.setVisible(false);
          if (!vert) { /* keep the arrow meaningful: it shows the side, not the swipe */ }
        } else {
          this.ghost.setVisible(false);
          this.arrUp.setVisible(false); this.arrDn.setVisible(false);
          this.nogo.setPosition(gx, gy).setDisplaySize(this.cell, this.cell).setVisible(true);
          this.selState = 'invalid';
        }
      },

      hideGhost: function () {
        this.ghost.setVisible(false);
        this.nogo.setVisible(false);
        this.arrUp.setVisible(false);
        this.arrDn.setVisible(false);
        this.dragTo = null;
      },

      /* --------------------------------------------------- the move */
      trySwap: function (r1, c1, r2, c2) {
        var b = this.board;
        var a = b.g[FZ.idx(r1, c1)], d = b.g[FZ.idx(r2, c2)];
        if (!FZ.swappable(a) || !FZ.swappable(d)) {
          this.rejectSwap(r1, c1, r2, c2);
          return false;
        }
        if (!FZ.testSwap(b, r1, c1, r2, c2)) {
          this.rejectSwap(r1, c1, r2, c2);
          return false;
        }
        FZ.doSwap(b, r1, c1, r2, c2);
        this.swapIdx = FZ.idx(r2, c2);
        this.moves--;
        this.movesUsed++;
        this.chain = 0;
        this.selR = r2; this.selC = c2;
        this.selState = 'resolve';
        this.selPose = 1;
        this.idleT = 0;
        kit.audio.sfx('sfx_swap', { volume: 0.62 });
        /* instant contact accent on both cells */
        this.popCell(r1, c1, 0.16);
        this.popCell(r2, c2, 0.20);
        this.phase = 'swap';
        this.timer = 0.16;
        return true;
      },

      rejectSwap: function (r1, c1, r2, c2) {
        kit.audio.sfx('sfx_invalid', { volume: 0.6 });
        this.selState = 'invalid';
        this.selPose = 0.6;
        var gx = this.cx(c2), gy = this.cy(r2);
        this.nogo.setPosition(gx, gy).setDisplaySize(this.cell, this.cell).setVisible(true);
        this.nogoT = 0.35;
        /* view-only nudge: never spend a move, never disturb the sim */
        this.nudge(r1, c1, r2, c2);
      },

      nudge: function (r1, c1, r2, c2) {
        var a = this.viewFor(this.board.g[FZ.idx(r1, c1)]);
        if (!a) return;
        var dx = (this.cx(c2) - this.cx(c1)) * 0.22;
        var dy = (this.cy(r2) - this.cy(r1)) * 0.22;
        a.x += dx; a.y += dy;
      },

      popCell: function (r, c, amt) {
        var cell = this.board.g[FZ.idx(r, c)];
        var v = this.viewFor(cell);
        if (v) v.pop = Math.max(v.pop, amt);
      },

      /* --------------------------------------------- resolution loop */
      stepPhase: function (dt) {
        this.timer -= dt;
        if (this.phase === 'idle') {
          this.idleT += dt;
          if (this.idleT > 8 && !this.hint) this.showHint(false);
          return;
        }
        if (this.timer > 0) return;

        if (this.phase === 'intro') {
          this.phase = 'idle';
          this.timer = 0;
          return;
        }
        if (this.phase === 'swap') {
          this.resolveStep();
          return;
        }
        if (this.phase === 'clear') {
          FZ.settle(this.board, false);
          this.consumeSpawns();
          this.board.events.length = 0;
          FZ.collectCaps(this.board);
          this.consumeEvents();
          this.phase = 'fall';
          this.timer = 0.20;
          return;
        }
        if (this.phase === 'fall') {
          this.resolveStep();
          return;
        }
        if (this.phase === 'endstep') {
          this.finishMove();
          return;
        }
        if (this.phase === 'over') {
          return;
        }
      },

      resolveStep: function () {
        var b = this.board;
        b.events.length = 0;
        var plan = FZ.planClear(b, this.swapIdx === undefined ? -1 : this.swapIdx);
        this.swapIdx = -1;
        if (plan) {
          var cleared = FZ.applyClear(b, plan, this.chain);
          this.consumeSpawns();
          this.consumeEvents();
          this.chain++;
          this.escalate(cleared, this.chain, plan);
          this.phase = 'clear';
          this.timer = 0.20;
          return;
        }
        this.phase = 'endstep';
        this.timer = 0.02;
      },

      finishMove: function () {
        var b = this.board;
        b.events.length = 0;

        /* the line's own motion: wave beat, then the Overflow vat's creep */
        if (this.cfg.every > 0 && this.movesUsed > 0 && this.movesUsed % this.cfg.every === 0) {
          if (FZ.advanceWave(b)) {
            kit.audio.sfx('sfx_rise', { volume: 0.5 });
            this.toast('ic_move', 'Line moved', this.vat.foam);
            this.fizzBurst();
          }
        }
        if (this.cfg.vat === 3 && this.movesUsed > 0 && this.movesUsed % Math.max(2, this.cfg.every * 3) === 0) {
          if (FZ.creepLine(b, 1)) {
            kit.audio.sfx('sfx_rise', { volume: 0.6, rate: 0.9 });
            this.toast('ic_move', 'Overflow rising', this.vat.accent);
            this.fizzBurst();
          }
        }

        FZ.settle(b, true);
        this.consumeSpawns();
        FZ.collectCaps(b);
        this.consumeEvents();

        if (FZ.planClear(b, -1)) {
          this.phase = 'fall';
          this.timer = 0.16;
          return;
        }

        if (!FZ.hasMove(b)) {
          FZ.shuffle(b);
          this.toast('ic_retry', 'Reshuffled', this.vat.foam);
        }

        this.syncLine(false);
        this.checkOutcome();
      },

      checkOutcome: function () {
        var b = this.board;
        var goalCaps = this.cfg.caps | 0;
        var capsDone = goalCaps >= 9999 ? false : b.capsOut >= goalCaps;
        var sealsDone = b.sealsLeft === 0;

        if (this.mode === 'endless') {
          if (sealsDone && b.sealsTotal > 0) { this.nextEndlessRound(); return; }
          if (this.moves <= 0) { this.endRun(false); return; }
          this.phase = 'idle';
          return;
        }
        if (capsDone && sealsDone) { this.endRun(true); return; }
        if (this.moves <= 0) { this.endRun(false); return; }
        this.phase = 'idle';
      },

      nextEndlessRound: function () {
        this.runScore = this.score();
        this.round++;
        this.moves += 6;
        var carried = this.moves;
        this.banner('Round ' + (this.round + 1), 'Line reset  ·  +6 moves', 1200, this.vat.accent);
        kit.audio.sfx('sfx_fanfare', { volume: 0.5 });
        this.reward(this.scale.width / 2, this.scale.height * 0.5, 10, this.vat.accent);
        this.level = 0;
        this.cfg = FZ.configFor('endless', 0, this.round);
        this.vat = FZ.vat(this.cfg.vat);
        this.board = FZ.makeBoard(this.cfg);
        this.moves = carried;
        this.releaseAllViews();
        this.bakeVatArt();
        this.relayout();
        this.phase = 'intro';
        this.timer = 0.5;
      },

      endRun: function (won) {
        this.phase = 'over';
        this.timer = 0;
        var b = this.board;
        var res = {
          cleared: won, movesLeft: Math.max(0, this.moves),
          capsOut: b.capsOut, sealsBroken: b.sealsBroken
        };
        var tier = won ? FZ.medalFor(this.cfg, res) : 0;
        this.medal = tier;
        FZ_STATE.medal = tier;

        if (this.mode === 'endless') {
          var sc = this.score();
          if (sc > SAVE.best) SAVE.best = sc;
          if (this.round > SAVE.bestRound) SAVE.bestRound = this.round;
          persist();
          kit.audio.sfx('sfx_fail', { volume: 0.7 });
          this.banner('Run over', 'Score ' + sc + '   Best ' + SAVE.best, 2600, 0xF25C68);
          this.showEndButtons(false);
          return;
        }

        if (!won) {
          kit.audio.sfx('sfx_fail', { volume: 0.7 });
          var need = [];
          if ((this.cfg.caps | 0) > b.capsOut) need.push((this.cfg.caps - b.capsOut) + ' caps left');
          if (b.sealsLeft > 0) need.push(b.sealsLeft + ' seals left');
          this.banner('Out of moves', need.join('  ·  ') || 'Try again', 2600, 0xF25C68);
          this.showEndButtons(false);
          return;
        }

        /* medal ceremony: the one hero beat in the title */
        var store = this.mode === 'rush' ? SAVE.rush : SAVE.stars;
        var key = String(this.level);
        if (tier > (store[key] | 0)) store[key] = tier;
        if (this.mode === 'ladder' && this.level + 1 >= SAVE.unlocked) {
          SAVE.unlocked = FZ.clamp(this.level + 2, 1, FZ.LEVELS.length);
        }
        persist();

        this.duckMusic();
        kit.audio.sfx('sfx_fanfare', { volume: 0.8 });
        this.time.delayedCall(420, function () { kit.audio.sfx('sfx_medal', { volume: 0.8 }); });
        var selfDuck = this;
        this.time.delayedCall(1750, function () { selfDuck.restoreMusic(); });
        this.medalT.setTexture('medal' + tier).setVisible(true);
        this.banner((FZ.MEDAL_NAMES[tier] || 'Bronze') + ' medal',
          this.moves + ' moves left  ·  ' + b.capsOut + ' caps',
          2800, FZ.MEDAL_COLORS[tier]);
        this.celebrate();

        /* vat complete is its own boundary beat, queued after the medal */
        if (this.mode === 'ladder') {
          var pr = FZ.vatProgress(SAVE, this.cfg.vat);
          if (pr.done >= pr.total) {
            var self = this, vt = this.vat;
            this.time.delayedCall(2900, function () {
              self.medalT.setVisible(false);
              self.banner(vt.name + ' complete', 'All ' + pr.total + ' levels cleared', 2400, vt.accent);
              self.celebrate();
            });
          }
        }
        this.showEndButtons(true);
      },

      showEndButtons: function (won) {
        var self = this, W = this.scale.width, H = this.scale.height;
        var ins = this.ins || FZ.safeInsets();
        this.time.delayedCall(won ? 900 : 700, function () {
          if (!self.scene || !self.scene.isActive()) return;
          self.btns.clear();
          var y = H - ins.bottom - 60;
          var bw = Math.min(150, (W - 60) / 2);
          self.btns.add({
            x: W / 2 - bw / 2 - 6, y: y, w: bw, h: 60, icon: 'ic_retry', iconSize: 24,
            iconX: W / 2 - bw - 6 + 26, label: 'Retry', labelX: W / 2 - bw / 2 + 16,
            onTap: function () { self.restartLevel(); }
          });
          var isLadder = self.mode === 'ladder', isRush = self.mode === 'rush';
          var hasNext = (isLadder && self.level + 1 < FZ.LEVELS.length) ||
                        (isRush && self.level + 1 < FZ.RUSH.length);
          if (won && hasNext) {
            self.btns.add({
              x: W / 2 + bw / 2 + 6, y: y, w: bw, h: 60, pri: true, icon: 'ic_play', iconSize: 24,
              iconX: W / 2 + 6 + 26, label: 'Next', labelX: W / 2 + bw / 2 + 22,
              onTap: function () {
                self.level++;
                self.clearTransients();
                self.startLevel(true);
                self.relayout();
                self.layoutControls(self.scale.width, self.scale.height, self.ins || FZ.safeInsets());
              }
            });
          } else {
            self.btns.add({
              x: W / 2 + bw / 2 + 6, y: y, w: bw, h: 60, pri: true, icon: 'ic_back', iconSize: 24,
              iconX: W / 2 + 6 + 26, label: 'Menu', labelX: W / 2 + bw / 2 + 22,
              onTap: function () { self.leave(); }
            });
          }
        });
      },

      /* ------------------------------------------------- sim -> view */
      consumeSpawns: function () {
        var sp = this.board.spawned;
        for (var i = 0; i < sp.length; i++) this.pendingSpawn[sp[i].id] = sp[i];
        sp.length = 0;
      },

      consumeEvents: function () {
        var ev = this.board.events, i;
        for (i = 0; i < ev.length; i++) {
          var e = ev[i];
          if (e.t === 'clear') this.fxClear(e);
          else if (e.t === 'special') this.fxSpecial(e);
          else if (e.t === 'cap') this.fxCap(e);
          else if (e.t === 'crack') this.fxCrack(e);
          else if (e.t === 'valve') this.fxValve(e);
        }
        ev.length = 0;
      },

      fxClear: function (e) {
        var x = this.cx(e.c), y = this.cy(e.r);
        var fam = FZ.family(e.col);
        var n = kit.juice.enabled ? 4 : 2;
        for (var i = 0; i < n; i++) {
          var a = FZ.vfxRnd() * Math.PI * 2;
          var sp = 60 + FZ.vfxRnd() * 90;
          this.pFrag.emit({
            x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - e.side * 40,
            ttl: 0.34 + FZ.vfxRnd() * 0.16, s0: this.cell * 0.34, s1: 0,
            spin: (FZ.vfxRnd() - 0.5) * 12, tint: fam.face, grav: e.side > 0 ? -180 : 220
          });
        }
        /* directional trail keyed to the side of the line the clear was on:
           the fizz side blows bubbles UP, the air side rains streaks DOWN */
        this.pTrail.emit({
          x: x, y: y, vx: (FZ.vfxRnd() - 0.5) * 30, vy: e.side > 0 ? -120 : 120,
          ttl: 0.5, s0: this.cell * 0.30, s1: this.cell * 0.06,
          tint: e.side > 0 ? this.vat.foam : fam.face, alpha: 0.85
        });
      },

      fxSpecial: function (e) {
        var x = this.cx(e.c), y = this.cy(e.r);
        this.pReward.emit({
          x: x, y: y, ttl: 0.45, s0: this.cell * 0.4, s1: this.cell * 1.5,
          tint: FZ.family(e.col).face, alpha: 0.9, spin: 3
        });
      },

      fxCap: function (e) {
        var x = this.cx(e.c), y = this.cy(e.r);
        kit.audio.sfx('sfx_cap', { volume: 0.8 });
        this.moves += this.cfg.refund | 0;
        this.toast('ic_cap', '+' + (this.cfg.refund | 0) + ' moves', this.vat.foam);
        this.reward(x, y, kit.juice.enabled ? 7 : 3, this.vat.foam);
        if (kit.juice.enabled) kit.juice.hitStop(40);
      },

      fxCrack: function (e) {
        var x = this.cx(e.c), y = this.cy(e.r);
        kit.audio.sfx('sfx_crack', { volume: 0.7 });
        for (var i = 0; i < (kit.juice.enabled ? 5 : 2); i++) {
          var a = -Math.PI / 2 + (FZ.vfxRnd() - 0.5) * 2.4;
          this.pFrag.emit({
            x: x, y: y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130,
            ttl: 0.36, s0: this.cell * 0.22, s1: 0, spin: 10,
            tint: FZ.TOK.sealHot, grav: 320
          });
        }
      },

      fxValve: function (e) {
        var x = this.cx(e.c), y = this.cy(e.r);
        kit.audio.sfx('sfx_valve', { volume: 0.9 });
        if (this.cfg.sealRefund > 0) {
          this.moves += this.cfg.sealRefund | 0;
          this.toast('ic_seal', 'Seal broken  +' + this.cfg.sealRefund, this.vat.accent);
        } else {
          this.toast('ic_seal', 'Seal broken', this.vat.accent);
        }
        var n = kit.juice.enabled ? 12 : 5;
        for (var i = 0; i < n; i++) {
          var a = -Math.PI / 2 + (FZ.vfxRnd() - 0.5) * 2.0;
          var sp = 120 + FZ.vfxRnd() * 200;
          this.pTrail.emit({
            x: x + (FZ.vfxRnd() - 0.5) * this.cell, y: y,
            vx: Math.cos(a) * sp * 0.4, vy: Math.sin(a) * sp,
            ttl: 0.7 + FZ.vfxRnd() * 0.3, s0: this.cell * 0.16, s1: this.cell * 0.42,
            tint: this.vat.foam, alpha: 0.9, grav: -60
          });
        }
        this.pReward.emit({
          x: x, y: y, ttl: 0.5, s0: this.cell * 0.5, s1: this.cell * 2.4,
          tint: this.vat.accent, alpha: 0.85
        });
        if (kit.juice.enabled) { kit.juice.shake(this.scale.height * 0.008, 180); kit.juice.hitStop(60); }
        this.syncLine(false);
      },

      fizzBurst: function () {
        for (var c = 0; c < COLS; c++) {
          this.pTrail.emit({
            x: this.cx(c), y: this.lineY[c],
            vx: (FZ.vfxRnd() - 0.5) * 40, vy: -70 - FZ.vfxRnd() * 60,
            ttl: 0.6, s0: this.cell * 0.14, s1: this.cell * 0.34,
            tint: this.vat.foam, alpha: 0.8
          });
        }
      },

      reward: function (x, y, n, tint) {
        for (var i = 0; i < n; i++) {
          var a = FZ.vfxRnd() * Math.PI * 2;
          var sp = 70 + FZ.vfxRnd() * 160;
          this.pReward.emit({
            x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
            ttl: 0.6 + FZ.vfxRnd() * 0.3, s0: this.cell * 0.34, s1: 0,
            spin: (FZ.vfxRnd() - 0.5) * 8, tint: tint, grav: 220, alpha: 0.95
          });
        }
      },

      celebrate: function () {
        var W = this.scale.width, H = this.scale.height;
        var n = kit.juice.enabled ? 14 : 5;
        for (var i = 0; i < n; i++) {
          this.pReward.emit({
            x: W * (0.2 + FZ.vfxRnd() * 0.6), y: H * 0.34,
            vx: (FZ.vfxRnd() - 0.5) * 260, vy: -120 - FZ.vfxRnd() * 180,
            ttl: 1.0 + FZ.vfxRnd() * 0.5, s0: 22, s1: 0,
            spin: (FZ.vfxRnd() - 0.5) * 8, grav: 380,
            tint: FZ.family((FZ.vfxRnd() * 6) | 0).face, alpha: 0.95
          });
        }
      },

      /* escalation ladder: single clear stays dry, combos earn the rim and a
         frame nudge, and only the goal gets the hero treatment */
      escalate: function (cleared, chain, plan) {
        var rate = Math.min(1.9, 1 + (chain - 1) * 0.09);
        kit.audio.sfx('sfx_clear', { volume: 0.55, rate: rate });
        if (chain >= 2) {
          kit.audio.sfx('sfx_combo', { volume: Math.min(0.7, 0.34 + chain * 0.07), rate: rate });
          this.rim.setPosition(this.bx + (COLS * this.cell) / 2, this.by + (ROWS * this.cell) / 2);
          this.rimT = 0.34;
          this.rim.setTint(this.vat.accent).setVisible(true);
          if (kit.juice.enabled) {
            kit.juice.shake(this.scale.height * (chain >= 4 ? 0.012 : 0.006), 150);
            kit.juice.hitStop(chain >= 4 ? 70 : 40);
          }
        }
        if (plan && plan.specials.length) kit.audio.sfx('sfx_fizz', { volume: 0.5 });
        FZ_STATE.chain = chain;
      },

      /* ------------------------------------------------ view records */
      viewFor: function (cell) {
        if (!cell) return null;
        var v = this.views[cell.id];
        if (v) return v;
        var img = this.viewPool.pop();
        if (!img) {
          img = this.add.image(-999, -999, 'p0').setDepth(20);
        }
        var sp = this.pendingSpawn[cell.id];
        var tx = this.cx(cell.c), ty = this.cy(cell.r);
        var x = tx, y = ty;
        if (sp && !sp.inPlace) {
          y = sp.fromFizz
            ? this.cy(ROWS - 1) + this.cell * (sp.dist + 0.6)
            : this.cy(0) - this.cell * (sp.dist + 0.6);
        }
        if (sp) delete this.pendingSpawn[cell.id];
        v = {
          img: img, x: x, y: y, pop: sp && sp.inPlace ? 0.30 : 0.0,
          gen: this.gen, dying: 0, tex: '', pose: 'idle',
          phase: ((cell.id * 17) % 97) * 0.064, lift: 0
        };
        img.setVisible(true).setAlpha(1);
        this.views[cell.id] = v;
        return v;
      },

      releaseView: function (id) {
        var v = this.views[id];
        if (!v) return;
        v.img.setVisible(false).setPosition(-999, -999).setAlpha(1);
        this.viewPool.push(v.img);
        delete this.views[id];
      },

      releaseAllViews: function () {
        for (var id in this.views) this.releaseView(id);
        this.pendingSpawn = {};
      },

      animate: function (dt) {
        var b = this.board, r, c, id;
        this.gen++;
        this.animClock = (this.animClock || 0) + dt;
        var cellSz = this.cell;
        var speed = 17;

        for (r = 0; r < ROWS; r++) {
          for (c = 0; c < COLS; c++) {
            var cell = b.g[FZ.idx(r, c)];
            if (!cell) continue;
            var v = this.viewFor(cell);
            if (!v) continue;
            v.gen = this.gen;
            var tx = this.cx(c), ty = this.cy(r);
            var dy = ty - v.y;
            var moving = Math.abs(dy) > 1.2 || Math.abs(tx - v.x) > 1.2;
            var nextPose = moving && cell.k === K.NORM ? (dy < 0 ? 'rise' : 'fall') : 'idle';
            v.pose = nextPose;
            v.lift = FZ.approach(v.lift, moving ? 1 : 0, moving ? 8 : 5, dt);
            v.x = FZ.approach(v.x, tx, speed, dt);
            v.y = FZ.approach(v.y, ty, speed, dt);
            if (Math.abs(v.y - ty) < 0.6 && v.settleFrom !== undefined && v.settleFrom > 1.5) {
              v.pop = Math.max(v.pop, kit.juice.enabled ? 0.06 : 0.0);
              v.settleFrom = 0;
            }
            v.settleFrom = Math.abs(v.y - ty);
            v.pop = Math.max(0, v.pop - dt * 3.4);
            var baseTex = FZ.art.textureForCell(cell);
            var tex = baseTex;
            if (cell.k === K.NORM && nextPose === 'rise') tex = 'pu' + FZ.clamp(cell.col | 0, 0, FZ.FAMILIES.length - 1);
            else if (cell.k === K.NORM && nextPose === 'fall') tex = 'pd' + FZ.clamp(cell.col | 0, 0, FZ.FAMILIES.length - 1);
            if (tex !== v.tex) { v.tex = tex; v.img.setTexture(tex); }
            var bob = Math.sin(this.animClock * (moving ? 8.5 : 3.1) + v.phase) * cellSz * (moving ? 0.018 : 0.028);
            var liftY = nextPose === 'rise' ? -cellSz * 0.035 * v.lift : (nextPose === 'fall' ? cellSz * 0.035 * v.lift : 0);
            var lean = nextPose === 'rise' ? -0.035 * v.lift : (nextPose === 'fall' ? 0.035 * v.lift : 0);
            var s = cellSz * (1 + v.pop + v.lift * 0.025 + (nextPose === 'idle' ? Math.abs(bob) / cellSz * 0.3 : 0));
            v.img.setPosition(v.x, v.y + bob + liftY).setRotation(lean);
            v.img.setDisplaySize(s, s);
          }
        }

        /* sweep: anything the sim no longer owns fades out and returns to the
           pool. The pool is never truncated or aliased by a debug read. */
        for (id in this.views) {
          var vv = this.views[id];
          if (vv.gen === this.gen) continue;
          vv.dying += dt;
          var k = vv.dying / 0.14;
          if (k >= 1) { this.releaseView(id); continue; }
          vv.img.setAlpha(1 - k);
          vv.img.setDisplaySize(cellSz * (1 - k * 0.7), cellSz * (1 - k * 0.7));
        }

        /* selector state machine: ready breathes, preview leans, resolve snaps */
        this.animSelector(dt);

        /* fizz line */
        this.syncLine(false);
        this.animFizz(dt);

        if (this.nogoT > 0) {
          this.nogoT -= dt;
          if (this.nogoT <= 0) {
            this.nogo.setVisible(false);
            if (this.phase === 'idle') this.selState = (this.tapR >= 0 || this.keyAnchor) ? 'preview' : 'ready';
          }
        }
        if (this.rimT > 0) {
          this.rimT -= dt;
          var rk = FZ.clamp(1 - this.rimT / 0.34, 0, 1);
          var sz = Math.max(this.boardW, this.boardH) * (0.9 + rk * 0.35);
          this.rim.setDisplaySize(sz, sz).setAlpha((1 - rk) * 0.6);
          if (this.rimT <= 0) this.rim.setVisible(false);
        }

        /* juice frame offset applies to the camera scroll, never to the sim */
        var f = kit.juice.frame();
        this.cameras.main.setScroll(-f.dx, -f.dy);
      },

      animSelector: function (dt) {
        this.selT = (this.selT || 0) + dt;
        if (this.selR < 0 || this.phase === 'over') { this.sel.setVisible(false); return; }
        var x = this.cx(this.selC), y = this.cy(this.selR);
        var base = this.cell;
        var s = base, alpha = 0.9;
        if (this.selState === 'ready') {
          s = base * (kit.juice.enabled ? (1.0 + 0.04 * (0.5 + 0.5 * Math.sin(this.selT * 3.2))) : 1.0);
          alpha = 0.55;
        } else if (this.selState === 'preview') {
          s = base * 1.10;
          alpha = 1.0;
        } else if (this.selState === 'invalid') {
          s = base * 1.04;
          alpha = 0.95;
        } else if (this.selState === 'resolve') {
          this.selPose = Math.max(0, this.selPose - dt * 3.2);
          s = base * (1.0 + 0.18 * this.selPose);
          alpha = 0.6 + 0.4 * this.selPose;
          if (this.selPose <= 0 && this.phase === 'idle') this.selState = 'ready';
        }
        this.sel.setVisible(true).setPosition(x, y).setDisplaySize(s, s).setAlpha(alpha);
        FZ.setTintIfChanged(this.sel, this.selState === 'invalid' ? 0xF25C68 : 0xFFFFFF);
      },

      /* -------------------------------------------------- fizz line */
      syncLine: function (snap) {
        var b = this.board;
        if (!b || !this.cell) return;
        for (var c = 0; c < COLS; c++) {
          this.lineTarget[c] = this.by + b.bnd[c] * this.cell;
          if (snap) this.lineY[c] = this.lineTarget[c];
        }
      },

      animFizz: function (dt) {
        var bottom = this.by + ROWS * this.cell;
        var top = this.by;
        var barH = Math.max(12, this.cell * 0.60);
        var minY = 1e9, maxY = -1e9;
        for (var c = 0; c < COLS; c++) {
          this.lineY[c] = FZ.approach(this.lineY[c], this.lineTarget[c], 9, dt);
          var y = this.lineY[c];
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          var h = Math.max(2, bottom - y);
          var body = this.fizzBody[c];
          body.setPosition(this.cx(c), y);
          body.setDisplaySize(this.cell, h);
          body.setVisible(true);
          var glaze = this.fizzGlaze[c];
          glaze.setPosition(this.cx(c), y);
          glaze.setDisplaySize(this.cell, h);
          glaze.setVisible(true);
          var bar = this.fizzBar[c];
          bar.setPosition(this.cx(c), y);
          bar.setDisplaySize(this.cell + 2, barH);
          bar.setVisible(true);
          bar.setAlpha(0.78 + 0.16 * Math.sin(this.selT * 2.4 + c * 0.7));
        }

        /* the two side markers sit just inside the frame, clear of the cells */
        var mk = this.cell * 0.40;
        this.markUp.setVisible(true)
          .setPosition(this.bx - this.pad * 0.5, Math.min(bottom - mk, maxY + this.cell * 0.75))
          .setDisplaySize(mk, mk).setTint(this.vat.foam).setAlpha(0.75);
        this.markDn.setVisible(true)
          .setPosition(this.bx - this.pad * 0.5, Math.max(top + mk, minY - this.cell * 0.75))
          .setDisplaySize(mk, mk).setTint(this.vat.frameHi).setAlpha(0.6);

        /* ambient motion, pooled and cheap: bubbles RISE in the fizz, motes
           FALL in the air. The two sides never look alike. */
        this.bubT = (this.bubT || 0) + dt;
        var period = 1.1 / Math.max(1, this.vat.bubbles / 14);
        if (this.bubT > period) {
          this.bubT = 0;
          var cc = (FZ.vfxRnd() * COLS) | 0;
          this.pTrail.emit({
            x: this.cx(cc) + (FZ.vfxRnd() - 0.5) * this.cell * 0.7,
            y: bottom - FZ.vfxRnd() * this.cell,
            vx: (FZ.vfxRnd() - 0.5) * 12, vy: -this.vat.bubbleRise * (0.7 + FZ.vfxRnd() * 0.6),
            ttl: 1.7, s0: this.cell * 0.10, s1: this.cell * 0.24,
            tint: this.vat.foam, alpha: 0.4
          });
          if (this.lineY[cc] - top > this.cell) {
            this.pTrail.emit({
              x: this.cx(cc) + (FZ.vfxRnd() - 0.5) * this.cell * 0.7,
              y: top + FZ.vfxRnd() * this.cell,
              vx: 0, vy: this.vat.bubbleRise * 0.55,
              ttl: 1.5, s0: this.cell * 0.16, s1: this.cell * 0.03,
              tint: this.vat.frameHi, alpha: 0.28
            });
          }
        }
      },

      /* ----------------------------------------------------- hinting */
      showHint: function (loud) {
        var h = FZ.findHint(this.board);
        if (!h) return;
        this.hint = h;
        this.hintT = 2.2;
        this.hintA.setVisible(true).setPosition(this.cx(h.c1), this.cy(h.r1))
          .setDisplaySize(this.cell, this.cell).setTint(this.vat.foam);
        this.hintB.setVisible(true).setPosition(this.cx(h.c2), this.cy(h.r2))
          .setDisplaySize(this.cell, this.cell).setTint(this.vat.foam);
        if (loud) {
          kit.audio.sfx('sfx_select', { volume: 0.5 });
          this.coach('Swap these two.');
        }
        var self = this;
        this.time.delayedCall(2200, function () { self.hideHint(); });
      },

      hideHint: function () {
        this.hint = null;
        this.hintA.setVisible(false);
        this.hintB.setVisible(false);
      },

      /* ------------------------------------------- verification hook */
      checkForceSwitches: function () {
        var s = FZ_STATE;
        var changed = false, mode = this.mode, level = this.level, round = this.round;
        if (s.forceMode && s.forceMode !== this.mode &&
            (s.forceMode === 'ladder' || s.forceMode === 'rush' || s.forceMode === 'endless')) {
          mode = s.forceMode; changed = true;
        }
        if (s.forceLevel >= 0) { level = s.forceLevel | 0; changed = true; }
        if (s.forceRound >= 0) { round = s.forceRound | 0; changed = true; }
        s.forceMode = null; s.forceLevel = -1; s.forceRound = -1;
        if (!changed) return;
        this.mode = mode;
        this.level = FZ.clamp(level, 0, FZ.levelCount(mode) - 1);
        this.round = FZ.clamp(round, 0, 999);
        this.clearTransients();
        this.startLevel(true);
        this.relayout();
        this.layoutControls(this.scale.width, this.scale.height, this.ins || FZ.safeInsets());
      },

      publish: function () {
        var s = FZ_STATE, b = this.board;
        s.mode = this.mode;
        s.level = this.level;
        s.round = this.round;
        s.vat = this.cfg ? this.cfg.vat : 0;
        s.vatName = this.vat ? this.vat.name : '';
        s.levelName = this.cfg ? (this.cfg.name || '') : '';
        s.moves = Math.max(0, this.moves | 0);
        s.movesMax = this.cfg ? (this.cfg.moves | 0) : 0;
        s.movesUsed = this.movesUsed | 0;
        s.phase = this.phase;
        s.chain = this.chain | 0;
        s.reducedMotion = !kit.juice.enabled;
        s.best = SAVE.best | 0;
        if (!b) return;
        s.fizzLine = FZ.meanLine(b);
        FZ.lineCols(b, s.fizzLineCols);
        s.seals = b.sealsLeft | 0;
        s.sealsTotal = b.sealsTotal | 0;
        s.sealsBroken = b.sealsBroken | 0;
        s.caps = b.capsOut | 0;
        s.capsGoal = this.cfg.caps >= 9999 ? 0 : (this.cfg.caps | 0);
        s.score = this.score();
      }
    }
  };

  /* PlayScene needs these fields before create() touches them. */
  PlayScene.extend.pendingSpawn = {};

  /* ================================================== game bootstrap == */
  /* Phaser only wires init/preload/create/update off a plain config object;
     custom methods on a literal are silently dropped. Every scene literal is
     promoted to a real Scene subclass with its whole method set (including the
     `extend` block) on the prototype. */
  function toScene(cfg) {
    var Klass = function () { Phaser.Scene.call(this, { key: cfg.key }); };
    Klass.prototype = Object.create(Phaser.Scene.prototype);
    Klass.prototype.constructor = Klass;
    var k;
    for (k in cfg) {
      if (k === 'key' || k === 'extend') continue;
      Klass.prototype[k] = cfg[k];
    }
    if (cfg.extend) {
      for (k in cfg.extend) Klass.prototype[k] = cfg.extend[k];
    }
    return Klass;
  }

  function boot() {
    var parent = document.getElementById('game') || document.body;
    GAME = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parent,               /* never null: null skips DOM mounting */
      backgroundColor: '#0B0F16',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
        width: root.innerWidth,
        height: root.innerHeight
      },
      /* antialias keeps LINEAR filtering: every texture here is baked at 2x
         the display size, so it is supersampled art and needs it. */
      render: {
        antialias: true, antialiasGL: false, roundPixels: false,
        powerPreference: 'high-performance', batchSize: 4096
      },
      fps: { target: 60, min: 30 },
      banner: false,
      scene: [toScene(BootScene), toScene(MenuScene), toScene(TankScene), toScene(PlayScene)]
    });
    root.__fz.game = GAME;
    root.__fz.kit = kit;
    root.__fz.save = function () { return SAVE; };
    root.__fz.resetSave = function () {
      SAVE = FZ.blankSave();
      persist();
      return SAVE;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.FZ, window);
