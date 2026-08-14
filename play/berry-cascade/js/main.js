/* Berry Cascade - GGKit lifecycle, meta scenes, boot, verification hook. */
(function (root) {
  'use strict';

  var SFX = {
    swap_tick: 'assets/swap_tick.mp3',
    invalid: 'assets/invalid.mp3',
    ui_click: 'assets/ui_click.mp3',
    match: 'assets/match.mp3',
    cascade: 'assets/cascade.mp3',
    combo: 'assets/combo.mp3',
    special: 'assets/special.mp3',
    detonate: 'assets/detonate.mp3',
    acorn: 'assets/acorn.mp3',
    syrup: 'assets/syrup.mp3',
    goal: 'assets/goal.mp3',
    medal: 'assets/medal.mp3',
    crown: 'assets/crown.mp3',
    theme_grove: 'assets/theme_grove.mp3',
    theme_summit: 'assets/theme_summit.mp3'
  };

  /* ------------------------------------------------------------- kit ----- */
  var kit = GGKit.create({
    slug: 'berry-cascade',
    orientation: 'portrait',
    validateSave: BC.validateSave,
    onPause: function () {
      var g = root.BCGame;
      if (g && g.phaser) {
        var s = g.phaser.scene.getScene('play');
        if (s && g.phaser.scene.isActive('play')) g.phaser.scene.pause('play');
      }
    },
    onResume: function () {
      var g = root.BCGame;
      if (g && g.phaser) {
        if (g.phaser.scene.isPaused('play')) g.phaser.scene.resume('play');
      }
    },
    onRestart: function () {
      var g = root.BCGame;
      if (g && g.phaser && g.phaser.scene.isActive('play')) {
        g.phaser.scene.getScene('play').restart();
      }
    }
  });
  kit.audio.register(SFX);
  /* Respect the operating system accessibility preference before Phaser
   * creates its first scene. The in-game setting can still be changed later. */
  if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    kit.juice.enabled = false;
  }

  var save = BC.normalizeSave(kit.save.get(null));

  var G = {
    kit: kit,
    save: save,
    prefs: { hints: save.hints !== 0 },
    phaser: null,
    verify: { scene: 'boot', mode: 'none', grove: -1, moves: 0, score: 0, over: false, goals: null },
    unlocked: false,

    persist: function () { kit.save.set(save); },
    persistPrefs: function () { save.hints = G.prefs.hints ? 1 : 0; kit.save.set(save); },

    audio: function (name, opts) {
      if (!G.unlocked) return;
      kit.audio.sfx(name, opts);
    },
    music: function (name) {
      if (!G.unlocked) { G.pendingMusic = name; return; }
      kit.audio.music(name, 700);
    },
    toggleMute: function () { kit.audio.setMute(!kit.audio.prefs.mute); },
    unlock: function () {
      if (G.unlocked) return;
      G.unlocked = true;
      if (G.pendingMusic) { kit.audio.music(G.pendingMusic, 700); G.pendingMusic = null; }
    },

    bestFor: function (mode, idx) {
      if (mode === 'endless') return save.endless | 0;
      if (mode === 'gauntlet') return save.gBest[idx] | 0;
      return save.best[idx] | 0;
    },

    recordWin: function (mode, idx, stars, score, medal) {
      if (mode === 'endless') { G.recordEndless(score, 0); return false; }
      var starArr = mode === 'gauntlet' ? save.gStars : save.stars;
      var bestArr = mode === 'gauntlet' ? save.gBest : save.best;
      var medArr = mode === 'gauntlet' ? save.gMedals : save.medals;
      idx = BC.clamp(idx | 0, 0, starArr.length - 1);
      if (stars > starArr[idx]) starArr[idx] = stars;
      if (score > bestArr[idx]) bestArr[idx] = score;
      if (medal > medArr[idx]) medArr[idx] = medal;
      var crowned = false;
      if (mode === 'trail') {
        if (idx + 2 > save.unlocked) save.unlocked = BC.clamp(idx + 2, 1, BC.GROVE_COUNT);
        var cleared = BC.trailCleared(save);
        var garden = BC.gardenStage(cleared);
        if (garden > save.garden) save.garden = garden;
        if (!save.crown && cleared >= BC.GROVE_COUNT) { save.crown = 1; crowned = true; }
      }
      G.persist();
      return crowned;
    },

    recordEndless: function (score, stage) {
      if (score > save.endless) save.endless = score | 0;
      if (stage > save.endlessStage) save.endlessStage = stage | 0;
      G.persist();
    },

    /* first grove that has not been cleared, else the last one */
    resumeGrove: function () {
      for (var i = 0; i < BC.GROVE_COUNT; i++) if (!save.stars[i]) return i;
      return BC.GROVE_COUNT - 1;
    },

    go: function (key, data) {
      if (!G.phaser) { G.pendingScene = { key: key, data: data }; return; }
      var mgr = G.phaser.scene;
      /* A switch thrown during boot is queued, not raced against it: the boot
       * scene consumes pendingScene when it hands off. */
      if (mgr.isActive('boot')) { G.pendingScene = { key: key, data: data }; return; }
      var scenes = mgr.getScenes(true);
      for (var i = 0; i < scenes.length; i++) mgr.stop(scenes[i].scene.key);
      mgr.start(key, data || {});
    }
  };
  root.BCGame = G;

  /* -------------------------------------------------- verification hook
   * Present from first script evaluation so a probe can read it before any
   * scene exists, and kept live by PlayScene.refreshVerify().
   */
  root.__bc = {
    version: '1.0.0',
    state: G.verify,
    get save() { return save; },
    segments: BC.SEGMENTS.map(function (s) { return { id: s.id, name: s.name, from: s.from, to: s.to }; }),
    forceMode: function (mode, arg) {
      if (mode === 'endless') { G.go('play', { mode: 'endless' }); return true; }
      if (mode === 'gauntlet') { G.go('play', { mode: 'gauntlet', gi: (arg | 0) }); return true; }
      if (mode === 'trail') { G.go('play', { mode: 'trail', n: (arg | 0) }); return true; }
      if (mode === 'map' || mode === 'trailmap') { G.go('trail', { focus: arg | 0 }); return true; }
      if (mode === 'menu') { G.go('menu'); return true; }
      if (mode === 'crown') { G.go('crown'); return true; }
      if (mode === 'gauntletmap') { G.go('gauntlet'); return true; }
      return false;
    },
    forceGrove: function (n) { G.go('play', { mode: 'trail', n: BC.clamp(n | 0, 0, BC.GROVE_COUNT - 1) }); return true; },
    unlockAll: function () {
      save.unlocked = BC.GROVE_COUNT;
      for (var i = 0; i < BC.GROVE_COUNT; i++) if (!save.stars[i]) save.stars[i] = 1;
      G.persist();
      return true;
    },
    reset: function () {
      var d = BC.defaultSave();
      for (var k in d) save[k] = d[k];
      G.persist();
      return true;
    }
  };

  /* ------------------------------------------------------------- BOOT --- */
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'boot' }); },
    create: function () {
      G.verify.scene = 'boot';
      /* Phaser RESIZE tracks the parent, but a window that is sized after the
       * document loads (headless capture, PWA launch, split screen) can leave
       * the game at the construction-time size. Pin it to the real viewport. */
      var vw = document.documentElement.clientWidth || window.innerWidth;
      var vh = document.documentElement.clientHeight || window.innerHeight;
      if (vw > 0 && vh > 0 && (Math.abs(this.scale.width - vw) > 1 || Math.abs(this.scale.height - vh) > 1)) {
        this.scale.resize(vw, vh);
      }
      kit.loader.show('Berry Cascade');
      kit.loader.progress(0.15);
      BCArt.bakeStatic(this);
      kit.loader.progress(0.55);
      var self = this;
      /* warm the first grove so the opening tap is instant */
      BC.buildGrove(0);
      kit.loader.progress(0.8);
      /* An audio decode must never be able to hold the title on the loader. */
      var done = false;
      var warmIndex = 1;
      function warmOne() {
        if (warmIndex >= BC.GROVE_COUNT) return;
        BC.buildGrove(warmIndex++);
        if (root.requestIdleCallback) root.requestIdleCallback(warmOne, { timeout: 1200 });
        else root.setTimeout(warmOne, 80);
      }
      function proceed() {
        if (done || !self.scene.isActive()) return;
        done = true;
        kit.loader.progress(1);
        kit.loader.hide();
        if (G.pendingScene) {
          var p = G.pendingScene; G.pendingScene = null;
          self.scene.start(p.key, p.data || {});
        } else {
          self.scene.start('menu');
        }
        /* Build one validated grove per idle slice so the next trail tap is
         * already warm without turning boot or an active frame into a hitch. */
        root.setTimeout(warmOne, 0);
      }
      self.time.delayedCall(2500, proceed);
      kit.audio.preload(['ui_click', 'swap_tick', 'match', 'invalid']).then(proceed, proceed);
      root.addEventListener('pointerdown', function () { G.unlock(); }, { once: true, passive: true });
      root.addEventListener('keydown', function () { G.unlock(); }, { once: true });
      kit.registerPWA();
    }
  });

  /* -------------------------------------------------- shared meta helpers */
  function metaBackdrop(scene, segId) {
    var seg = BC.segmentById(segId);
    var W = scene.scale.width, H = scene.scale.height;
    var key = 'bc_sky_' + seg.id + '_' + Math.round(W) + 'x' + Math.round(H);
    if (!scene.textures.exists(key)) BCArt.bakeSky(scene, key, W, H, seg);
    var img = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(-10);
    img.setDisplaySize(W, H);
    return img;
  }

  /* ------------------------------------------------------------- MENU --- */
  var MenuScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function MenuScene() { Phaser.Scene.call(this, { key: 'menu' }); },
    create: function () {
      G.verify.scene = 'menu'; G.verify.mode = 'menu'; G.verify.over = false;
      var self = this;
      var W = this.scale.width, H = this.scale.height;
      var ins = BCUI.insets();
      metaBackdrop(this, 'summit');
      G.music('theme_grove');

      /* hero: a static cascade of three berries, baked textures only */
      var hero = this.add.container(W / 2, Math.max(140, H * 0.20));
      var picks = [[0, 0, -52, 18, 1.15], [2, 0, 4, -14, 1.3], [3, 1, 58, 20, 1.0]];
      for (var i = 0; i < picks.length; i++) {
        var p = picks[i];
        var im = this.add.image(p[2], p[3], BCArt.berryKey(p[0], p[1]));
        im.setDisplaySize(66 * p[4], 66 * p[4]);
        hero.add(im);
      }
      var title = BCUI.text(this, W / 2, Math.max(200, H * 0.20) + 74, 'BERRY CASCADE', 30, 800, '#FFF0BE');
      var sub = BCUI.text(this, W / 2, title.y + 26, 'Thirty groves. No lives, no boosters.', 14, 600, '#C9D4E4');

      var y = Math.max(title.y + 84, H * 0.46);
      var cleared = BC.trailCleared(save);
      var resume = G.resumeGrove();
      BCUI.pill(this, {
        x: W / 2, y: y, w: Math.min(280, W - 60), h: 56, fill: 0x5BCB77, icon: 'play',
        label: cleared === 0 ? 'Start the trail' : ('Grove ' + (resume + 1)),
        onPress: function () { G.unlock(); G.audio('ui_click'); self.scene.start('trail', { focus: resume }); }
      });
      BCUI.pill(this, {
        x: W / 2, y: y + 66, w: Math.min(280, W - 60), h: 52, fill: 0x2E4269, color: '#F7FBFF',
        icon: 'infinity', iconTint: 0xF7FBFF, label: 'Endless Cascade',
        onPress: function () { G.unlock(); G.audio('ui_click'); self.scene.start('play', { mode: 'endless' }); }
      });
      var gOpen = BC.gauntletUnlocked(0, save);
      BCUI.pill(this, {
        x: W / 2, y: y + 128, w: Math.min(280, W - 60), h: 52,
        fill: gOpen ? 0x3A2F63 : 0x22304C, color: '#F7FBFF',
        icon: gOpen ? 'medal' : 'lock', iconTint: 0xF7FBFF,
        label: gOpen ? 'Grove Gauntlet' : ('Gauntlet at ' + BC.GAUNTLET[0].needTrail + ' groves'),
        onPress: function () {
          G.unlock(); G.audio('ui_click');
          if (gOpen) self.scene.start('gauntlet');
        }
      }).setEnabled(gOpen);
      BCUI.pill(this, {
        x: W / 2, y: y + 190, w: Math.min(280, W - 60), h: 52,
        fill: 0x244A41, color: '#F7FBFF', icon: 'acorn', iconTint: 0xF7FBFF,
        label: 'Berry Terrace ' + (save.garden | 0) + '/3',
        onPress: function () { G.unlock(); G.audio('ui_click'); self.scene.start('garden'); }
      });

      /* one compact stat line, not a wall of text */
      var stats = BCUI.text(this, W / 2, H - ins.bottom - 74,
        BC.totalStars(save) + ' stars   ' + BC.medalPoints(save) + ' medal points   best ' + (save.endless | 0),
        13, 650, '#9FB0CA');
      if (save.crown) {
        var cr = this.add.image(W / 2 - 92, stats.y - 30, 'bc_ic_crown');
        cr.setDisplaySize(22, 22).setTint(0xF2C74B);
        BCUI.text(this, W / 2 + 8, stats.y - 30, 'Trail crown earned', 13, 700, '#F2C74B');
      }

      BCUI.button(this, {
        x: W - ins.right - 34, y: ins.top + 34, icon: 'gear', size: 44, fill: 0x1C2A46,
        onPress: function () { G.unlock(); kit.openSettings(); }
      });
      BCUI.button(this, {
        x: ins.left + 34, y: ins.top + 34, icon: kit.audio.prefs.mute ? 'mute' : 'sound', size: 44, fill: 0x1C2A46,
        onPress: function () { G.unlock(); G.toggleMute(); self.scene.restart(); }
      });

      this.onResize = function () { if (self.scene.isActive()) self.scene.restart(); };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize); });
    }
  });

  /* ------------------------------------------------------------ TRAIL --- */
  var TrailScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function TrailScene() { Phaser.Scene.call(this, { key: 'trail' }); },

    init: function (data) {
      this.focus = BC.clamp((data && data.focus) | 0, 0, BC.GROVE_COUNT - 1);
    },

    create: function () {
      G.verify.scene = 'trail'; G.verify.mode = 'trail'; G.verify.over = false;
      var self = this;
      var W = this.scale.width, H = this.scale.height;
      this.ins = BCUI.insets();
      metaBackdrop(this, 'orchard');
      G.music('theme_grove');

      this.headerH = this.ins.top + 54;
      this.spacing = 96;
      this.contentH = BC.GROVE_COUNT * this.spacing + 200;
      this.world = this.add.container(0, 0);
      this.world.setDepth(1);

      /* segment bands, one baked strip each */
      var i, s;
      for (i = 0; i < BC.SEGMENTS.length; i++) {
        s = BC.SEGMENTS[i];
        var yTop = this.nodeY(s.to) - this.spacing * 0.6;
        var yBot = this.nodeY(s.from) + this.spacing * 0.6;
        var bandKey = BCArt.bakeSwatch(this, 'bc_band_' + s.id, s.skyTop);
        var band = this.add.image(0, yTop, bandKey).setOrigin(0, 0);
        band.setDisplaySize(W, Math.max(10, yBot - yTop));
        band.setAlpha(0.42);
        this.world.add(band);
        /* segment label hugs the left edge: the nodes own the centre line */
        var lbl = BCUI.text(this, 14, yTop + 16, s.name.toUpperCase(), 12, 750, '#F7FBFF');
        lbl.setOrigin(0, 0.5);
        lbl.setAlpha(0.7);
        this.world.add(lbl);
        var rule = this.add.image(0, yTop, BCArt.bakeSwatch(this, 'bc_rule', 0xF7FBFF)).setOrigin(0, 0);
        rule.setDisplaySize(W, 1).setAlpha(0.16);
        this.world.add(rule);
      }

      /* path dots between nodes */
      for (i = 0; i < BC.GROVE_COUNT - 1; i++) {
        var ax = this.nodeX(i), ay = this.nodeY(i);
        var bxp = this.nodeX(i + 1), byp = this.nodeY(i + 1);
        for (var k = 1; k <= 4; k++) {
          var t = k / 5;
          var d = this.add.image(BC.lerp(ax, bxp, t), BC.lerp(ay, byp, t), 'bc_dot');
          d.setDisplaySize(9, 9).setTint(0xF7FBFF).setAlpha(0.30);
          this.world.add(d);
        }
      }

      /* nodes */
      this.nodes = [];
      for (i = 0; i < BC.GROVE_COUNT; i++) this.nodes.push(this.buildNode(i));

      /* header, fixed above the scrolling world */
      var hdr = this.add.container(0, 0).setDepth(20);
      var bar = this.add.image(0, 0, 'bc_ink').setOrigin(0, 0);
      bar.setDisplaySize(W, this.headerH).setAlpha(1);
      hdr.add(bar);
      BCUI.button(this, {
        x: this.ins.left + 32, y: this.ins.top + 26, icon: 'back', size: 44, fill: 0x2E4269,
        onPress: function () { G.audio('ui_click'); self.scene.start('menu'); }
      }).root.setDepth(21);
      var starChip = BCUI.chip(this, {
        x: W / 2 - 30, y: this.ins.top + 26, icon: 'score', value: BC.totalStars(save) + '/' + (BC.GROVE_COUNT * 3),
        w: 88, h: 36, size: 14, tint: 0xF7C948
      });
      starChip.root.setDepth(21);
      var medChip = BCUI.chip(this, {
        x: W / 2 + 62, y: this.ins.top + 26, icon: 'medal', value: String(BC.medalPoints(save)),
        w: 58, h: 36, size: 14, tint: 0xF2C74B
      });
      medChip.root.setDepth(21);
      BCUI.button(this, {
        x: W - this.ins.right - 32, y: this.ins.top + 26,
        icon: BC.gauntletUnlocked(0, save) ? 'medal' : 'lock', size: 44, fill: 0x3A2F63,
        onPress: function () {
          G.audio('ui_click');
          if (BC.gauntletUnlocked(0, save)) self.scene.start('gauntlet');
          else self.hint('Clear ' + BC.GAUNTLET[0].needTrail + ' groves to open the Gauntlet');
        }
      }).root.setDepth(21);

      this.toast = BCUI.transients(this, this.add.container(0, 0).setDepth(30), {
        isLive: function () { return false; },
        reduced: function () { return !kit.juice.enabled; }
      });

      /* scroll state; gestures are event driven through the GGKit identity map */
      this.scrollMin = Math.min(0, this.scale.height - this.contentH);
      this.scrollMax = 0;
      this.scrollY = BC.clamp(this.scale.height * 0.55 - this.nodeY(this.focus), this.scrollMin, this.scrollMax);
      this.world.setY(Math.round(this.scrollY));
      this.vel = 0;
      this.drag = null;
      this.gest = BCUI.gestures(this, kit, {
        onDown: function (id, x, y) {
          if (self.drag) return;
          self.drag = { id: id, x0: x, y0: y, sy: self.scrollY, py: y, pt: performance.now(), moved: 0 };
          self.vel = 0;
        },
        onMove: function (id, x, y) {
          var d = self.drag;
          if (!d || d.id !== id) return;
          var now = performance.now();
          var dt = Math.max(8, now - d.pt) / 1000;
          self.vel = (y - d.py) / dt;
          d.py = y; d.pt = now;
          d.moved = Math.max(d.moved, Math.abs(y - d.y0) + Math.abs(x - d.x0));
          self.scrollY = BC.clamp(d.sy + (y - d.y0), self.scrollMin, self.scrollMax);
          self.world.setY(Math.round(self.scrollY));
        },
        onUp: function (id, x, y) {
          var d = self.drag;
          if (!d || d.id !== id) return;
          self.drag = null;
          if (d.moved >= 12 || d.y0 <= self.headerH) return;
          self.vel = 0;
          var px = d.x0, py = d.y0 - self.scrollY;
          var bestI = -1, bestD = 46 * 46;
          for (var i = 0; i < BC.GROVE_COUNT; i++) {
            var ddx = px - self.nodeX(i), ddy = py - self.nodeY(i);
            var d2 = ddx * ddx + ddy * ddy;
            if (d2 < bestD) { bestD = d2; bestI = i; }
          }
          if (bestI >= 0) self.openNode(bestI);
        }
      });

      this.onResize = function () { if (self.scene.isActive()) self.scene.restart({ focus: self.focus }); };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize); });
    },

    hint: function (msg) {
      this.toast.chip(msg, { icon: 'lock', tint: 0xF7C948, x: this.scale.width / 2, y: this.headerH + 26, hold: 1000 });
    },

    nodeX: function (i) {
      var W = this.scale.width;
      return W / 2 + Math.sin(i * 0.85 + 0.4) * Math.min(W * 0.26, 110);
    },
    nodeY: function (i) {
      return this.contentH - 130 - i * this.spacing;
    },

    buildNode: function (i) {
      var self = this;
      var open = i < save.unlocked;
      var done = save.stars[i] > 0;
      var c = this.add.container(this.nodeX(i), this.nodeY(i));
      var seg = BC.segmentFor(i);
      var kind = done ? 'done' : (open ? 'open' : 'locked');
      var nodeKey = BCArt.bakeNode(this, 'bc_node_' + seg.id + '_' + kind, kind, seg);
      var img = this.add.image(0, 0, nodeKey);
      img.setDisplaySize(58, 58);
      c.add(img);
      if (open) {
        var num = BCUI.text(this, 0, 1, String(i + 1), 20, 800, '#182238');
        c.add(num);
      } else {
        var lk = this.add.image(0, 0, 'bc_ic_lock');
        lk.setDisplaySize(24, 24).setTint(0x9FB0CA);
        c.add(lk);
      }
      for (var k = 0; k < 3; k++) {
        var st = this.add.image((k - 1) * 15, -38, save.stars[i] > k ? 'bc_star1' : 'bc_star0');
        st.setDisplaySize(14, 14);
        st.setVisible(open);
        c.add(st);
      }
      if (save.medals[i] > 0) {
        var md = this.add.image(26, 24, 'bc_medal' + save.medals[i]);
        md.setDisplaySize(24, 24);
        c.add(md);
      }
      var nm = BCUI.text(this, 0, 40, open ? BC.groveName(i) : 'Locked', 12, 650, open ? '#DCE6F5' : '#7C8CA8');
      c.add(nm);
      this.world.add(c);
      c.__i = i; c.__open = open;
      return c;
    },

    openNode: function (i) {
      if (i >= save.unlocked) { this.hint('Clear grove ' + save.unlocked + ' first'); return; }
      G.unlock();
      G.audio('ui_click');
      this.scene.start('play', { mode: 'trail', n: i });
    },

    update: function (time, delta) {
      if (kit.paused) return;
      var dt = Math.min(delta, 50) / 1000;
      if (this.drag) return;
      if (Math.abs(this.vel) > 8) {
        this.scrollY = BC.clamp(this.scrollY + this.vel * dt, this.scrollMin, this.scrollMax);
        this.vel *= Math.pow(0.0025, dt);
        this.world.setY(Math.round(this.scrollY));
      } else if (this.vel !== 0) {
        this.vel = 0;
      }
    }
  });

  /* --------------------------------------------------------- GAUNTLET --- */
  var GauntletScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function GauntletScene() { Phaser.Scene.call(this, { key: 'gauntlet' }); },
    create: function () {
      G.verify.scene = 'gauntlet'; G.verify.mode = 'gauntlet'; G.verify.over = false;
      var self = this;
      var W = this.scale.width, H = this.scale.height;
      var ins = BCUI.insets();
      metaBackdrop(this, 'lantern');
      G.music('theme_summit');

      BCUI.text(this, W / 2, ins.top + 30, 'GROVE GAUNTLET', 22, 800, '#F0D089');
      BCUI.text(this, W / 2, ins.top + 68, 'Hand-authored hardest goals. Medals open the chain.', 12, 600, '#9FB0CA');
      BCUI.button(this, {
        x: ins.left + 32, y: ins.top + 30, icon: 'back', size: 44, fill: 0x2E4269,
        onPress: function () { G.audio('ui_click'); self.scene.start('trail', { focus: G.resumeGrove() }); }
      });

      var toast = BCUI.transients(this, this.add.container(0, 0).setDepth(30), {
        isLive: function () { return false; },
        reduced: function () { return !kit.juice.enabled; }
      });

      var top = ins.top + 96;
      var rowH = Math.min(84, (H - top - ins.bottom - 20) / BC.GAUNTLET.length);
      var cardW = Math.min(W - 28, 360);
      var key = 'bc_grow_' + Math.round(cardW) + 'x' + Math.round(rowH - 8);
      if (!this.textures.exists(key)) BCArt.bakeCard(this, key, cardW, rowH - 8, 14, 0x1C2A46, 0.94, 0x5D7294, 0.5);

      for (var i = 0; i < BC.GAUNTLET.length; i++) {
        (function (gi) {
          var d = BC.GAUNTLET[gi];
          var open = BC.gauntletUnlocked(gi, save);
          var y = top + rowH * gi + rowH / 2;
          var row = self.add.container(W / 2, y);
          var bg = self.add.image(0, 0, key);
          bg.setAlpha(open ? 1 : 0.55);
          row.add(bg);
          var ic = self.add.image(-cardW / 2 + 30, 0, open ? 'bc_ic_medal' : 'bc_ic_lock');
          ic.setDisplaySize(24, 24).setTint(open ? 0xF2C74B : 0x7C8CA8);
          row.add(ic);
          var nm = BCUI.text(self, -cardW / 2 + 54, -12, d.name, 16, 750, open ? '#F7FBFF' : '#9FB0CA');
          nm.setOrigin(0, 0.5); row.add(nm);
          var info = open ? d.blurb : ('Needs ' + d.needTrail + ' groves and ' + d.needPoints + ' medal points');
          var bl = BCUI.text(self, -cardW / 2 + 54, 10, info, 12, 600, '#9FB0CA');
          bl.setOrigin(0, 0.5);
          bl.setWordWrapWidth(cardW - 110);
          row.add(bl);
          if (save.gMedals[gi] > 0) {
            var md = self.add.image(cardW / 2 - 28, 0, 'bc_medal' + save.gMedals[gi]);
            md.setDisplaySize(30, 30);
            row.add(md);
          }
          row.setSize(cardW, rowH - 8);
          row.setInteractive(new Phaser.Geom.Rectangle(-cardW / 2, -(rowH - 8) / 2, cardW, rowH - 8),
            Phaser.Geom.Rectangle.Contains);
          row.on('pointerup', function () {
            G.unlock();
            if (open) { G.audio('ui_click'); self.scene.start('play', { mode: 'gauntlet', gi: gi }); }
            else toast.chip('Locked: ' + d.needPoints + ' medal points', { icon: 'lock', tint: 0xF7C948, x: W / 2, y: top - 20, hold: 1000 });
          });
        })(i);
      }

      this.onResize = function () { if (self.scene.isActive()) self.scene.restart(); };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize); });
    }
  });

  /* ---------------------------------------------------------- TERRACE --- */
  var GardenScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function GardenScene() { Phaser.Scene.call(this, { key: 'garden' }); },
    create: function () {
      G.verify.scene = 'garden'; G.verify.mode = 'garden'; G.verify.over = true;
      var self = this, W = this.scale.width, H = this.scale.height, ins = BCUI.insets();
      metaBackdrop(this, 'orchard');
      G.music('theme_grove');
      BCUI.text(this, W / 2, ins.top + 58, 'BERRY TERRACE', 27, 800, '#FFF0BE');
      BCUI.text(this, W / 2, ins.top + 91, 'A quiet place restored by the trail.', 14, 650, '#C9D4E4');

      var steps = [
        { title: 'Orchard seed bed', copy: 'The first beds are green again.', icon: 'bc_b2_0' },
        { title: 'Marsh water rill', copy: 'Clear syrup groves to bring back the flow.', icon: 'bc_syr1' },
        { title: 'Crown arbor', copy: 'The far terrace blooms after the full trail.', icon: 'bc_ic_crown' }
      ];
      var cardW = Math.min(W - 32, 350), cardH = 92, top = ins.top + 142;
      for (var i = 0; i < steps.length; i++) {
        var y = top + i * (cardH + 12);
        var key = 'bc_terrace_' + cardW + 'x' + cardH;
        if (!this.textures.exists(key)) BCArt.bakeCard(this, key, cardW, cardH, 18, 0x1C2A46, 0.96, 0x5D7294, 0.55);
        var row = this.add.container(W / 2, y + cardH / 2);
        row.add(this.add.image(0, 0, key));
        var unlocked = (save.garden | 0) > i;
        var icon = this.add.image(-cardW / 2 + 42, 0, unlocked ? steps[i].icon : 'bc_ic_lock');
        icon.setDisplaySize(unlocked ? 42 : 30, unlocked ? 42 : 30);
        if (!unlocked) icon.setTint(0x9FB0CA);
        row.add(icon);
        var title = BCUI.text(this, -cardW / 2 + 76, -15, steps[i].title, 16, 750,
          unlocked ? '#F7FBFF' : '#9FB0CA');
        title.setOrigin(0, 0.5); row.add(title);
        var copy = unlocked ? steps[i].copy : ('Clear ' + [7, 15, 30][i] + ' groves to restore this step.');
        var detail = BCUI.text(this, -cardW / 2 + 76, 15, copy, 12, 600,
          unlocked ? '#B7D9C2' : '#7C8CA8');
        detail.setOrigin(0, 0.5); detail.setWordWrapWidth(cardW - 98); row.add(detail);
      }

      BCUI.text(this, W / 2, top + 3 * (cardH + 12) + 22,
        (save.garden | 0) + ' of 3 restorations complete', 13, 650, '#F2C74B');
      BCUI.button(this, {
        x: ins.left + 34, y: ins.top + 30, icon: 'back', size: 44, fill: 0x2E4269,
        onPress: function () { G.audio('ui_click'); self.scene.start('menu'); }
      });
      BCUI.button(this, {
        x: W - ins.right - 34, y: ins.top + 30, icon: 'map', size: 44, fill: 0x2E4269,
        onPress: function () { G.audio('ui_click'); self.scene.start('trail', { focus: G.resumeGrove() }); }
      });
      this.onResize = function () { if (self.scene.isActive()) self.scene.restart(); };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize); });
    }
  });

  /* ------------------------------------------------------------ CROWN --- */
  var CrownScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function CrownScene() { Phaser.Scene.call(this, { key: 'crown' }); },
    create: function () {
      G.verify.scene = 'crown'; G.verify.mode = 'crown'; G.verify.over = true;
      var self = this;
      var W = this.scale.width, H = this.scale.height;
      var ins = BCUI.insets();
      metaBackdrop(this, 'summit');
      G.music('theme_summit');
      G.audio('crown', { volume: 1 });

      var crown = this.add.image(W / 2, H * 0.26, 'bc_ic_crown');
      crown.setDisplaySize(96, 96).setTint(0xF2C74B);
      if (kit.juice.enabled) {
        this.tweens.add({
          targets: crown, scaleX: crown.scaleX * 1.06, scaleY: crown.scaleY * 1.06,
          duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      }

      BCUI.text(this, W / 2, H * 0.26 + 82, 'TRAIL CROWN', 28, 800, '#FFF0BE');
      BCUI.text(this, W / 2, H * 0.26 + 112, 'All thirty groves cleared.', 15, 650, '#C9D4E4');
      BCUI.text(this, W / 2, H * 0.26 + 142,
        BC.totalStars(save) + ' of ' + (BC.GROVE_COUNT * 3) + ' stars   ' + BC.medalPoints(save) + ' medal points',
        14, 650, '#9FB0CA');

      var fxLayer = this.add.container(0, 0).setDepth(5);
      var fx = BCFx.create(this, fxLayer, kit);
      this.fxRef = fx;
      fx.confetti(W / 2, H * 0.22, W * 0.7, 0xF2C74B);
      this.time.addEvent({
        delay: 900, loop: true, callback: function () { fx.confetti(W / 2, H * 0.20, W * 0.7, 0xF2C74B); }
      });

      var y = H * 0.62;
      BCUI.pill(this, {
        x: W / 2, y: y, w: Math.min(280, W - 60), h: 54, fill: 0x5BCB77, icon: 'medal',
        label: 'Grove Gauntlet',
        onPress: function () { G.audio('ui_click'); self.scene.start('gauntlet'); }
      });
      BCUI.pill(this, {
        x: W / 2, y: y + 66, w: Math.min(280, W - 60), h: 52, fill: 0x2E4269, color: '#F7FBFF',
        icon: 'infinity', iconTint: 0xF7FBFF, label: 'Endless Cascade',
        onPress: function () { G.audio('ui_click'); self.scene.start('play', { mode: 'endless' }); }
      });
      BCUI.pill(this, {
        x: W / 2, y: y + 128, w: Math.min(280, W - 60), h: 52, fill: 0x1C2A46, color: '#F7FBFF',
        icon: 'map', iconTint: 0xF7FBFF, label: 'Back to the trail',
        onPress: function () { G.audio('ui_click'); self.scene.start('trail', { focus: BC.GROVE_COUNT - 1 }); }
      });
      BCUI.text(this, W / 2, H - ins.bottom - 26, 'Nothing was ever for sale here.', 12, 600, '#7C8CA8');

      this.onResize = function () { if (self.scene.isActive()) self.scene.restart(); };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize); });
    },
    update: function (time, delta) {
      if (kit.paused) return;
      if (this.fxRef) this.fxRef.update(Math.min(delta, 50) / 1000);
    }
  });

  /* ------------------------------------------------------------- game --- */
  function start() {
    G.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: document.body,          /* never null: null skips DOM mounting */
      backgroundColor: '#182238',
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: window.innerWidth,
        height: window.innerHeight
      },
      render: { antialias: true, roundPixels: false, powerPreference: 'high-performance', batchSize: 2048 },
      fps: { target: 60, min: 30 },
      scene: [BootScene, MenuScene, TrailScene, GauntletScene, PlayScene, GardenScene, CrownScene]
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
