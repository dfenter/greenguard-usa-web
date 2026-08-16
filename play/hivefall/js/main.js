/* Hivefall - GGKit lifecycle, menus, shelter meta, boot, verification hook. */
(function (root) {
  'use strict';

  var AUDIO = {
    swap: 'assets/swap.mp3',
    invalid: 'assets/invalid.mp3',
    click: 'assets/click.mp3',
    match: 'assets/match.mp3',
    cascade: 'assets/cascade.mp3',
    shot: 'assets/shot.mp3',
    impact: 'assets/impact.mp3',
    kill: 'assets/kill.mp3',
    repair: 'assets/repair.mp3',
    salvage: 'assets/salvage.mp3',
    breach: 'assets/breach.mp3',
    flare: 'assets/flare.mp3',
    clear: 'assets/clear.mp3',
    boss: 'assets/boss.mp3',
    defeat: 'assets/defeat.mp3',
    theme_watch: 'assets/theme_watch.mp3',
    theme_siege: 'assets/theme_siege.mp3',
    theme_shelter: 'assets/theme_shelter.mp3'
  };

  /* ------------------------------------------------------------- kit --- */
  var kit = GGKit.create({
    slug: 'hivefall',
    orientation: 'portrait',
    validateSave: HF.validateSave,
    onPause: function () {
      var g = root.HFGame;
      if (!g) return;
      g.verify.paused = true;
      if (g.phaser && g.phaser.scene.isActive('play')) g.phaser.scene.pause('play');
    },
    onResume: function () {
      var g = root.HFGame;
      if (!g) return;
      g.verify.paused = false;
      if (g.phaser && g.phaser.scene.isPaused('play')) g.phaser.scene.resume('play');
    },
    onRestart: function () {
      var g = root.HFGame;
      if (g && g.phaser && g.phaser.scene.isActive('play')) {
        g.phaser.scene.getScene('play').restart();
      }
    }
  });
  kit.audio.register(AUDIO);
  if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    kit.juice.enabled = false;
  }

  var save = HF.normalizeSave(kit.save.get(null));

  var G = {
    kit: kit,
    save: save,
    prefs: { hints: save.hints !== 0 },
    phaser: null,
    unlocked: false,
    pendingMusic: null,
    pendingScene: null,
    verify: {
      scene: 'boot', mode: 'none', stage: 0, act: 0, actName: '',
      progress: 0, score: 0, health: 100, wall: 0, wallMax: 0, kills: 0,
      salvage: 0, remaining: 0, boss: null, hazards: 0, flares: 0,
      over: false, paused: false
    },

    persist: function () {
      save.v = HF.SAVE_VERSION;
      save.hints = G.prefs.hints ? 1 : 0;
      kit.save.set(save);
    },

    audio: function (name, opts) { if (G.unlocked) kit.audio.sfx(name, opts); },
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
    openSettings: function () {
      kit.openSettings([function (box, row) {
        row('Coach hints', function () { return G.prefs.hints; }, function (v) {
          G.prefs.hints = v; G.persist();
        });
      }]);
    },

    /* ---- progression, all validated against the content registry ---- */
    recordWaveClear: function (wave) {
      wave = HF.clamp(wave | 0, 1, HF.WAVES);
      if (wave > save.cleared) save.cleared = wave;
      var next = HF.clamp(wave + 1, 1, HF.WAVES);
      if (wave >= HF.WAVES) {
        save.runs++;
        save.wave = HF.WAVES;
      } else if (next > save.wave) {
        save.wave = next;
      }
      if (save.wave > save.best) save.best = save.wave;
      if (wave + 1 > save.best) save.best = HF.clamp(wave + 1, 1, HF.WAVES);
      G.persist();
    },
    recordEndless: function (stage, kills, salvage) {
      var sc = HF.endlessScore(stage, kills, salvage);
      if (sc > save.endlessBest) save.endlessBest = sc;
      if (stage > save.endlessStage) save.endlessStage = stage;
      G.persist();
    },
    buy: function (u) {
      var lvl = save.up[u.key] | 0;
      if (lvl >= u.max) return false;
      if (!HF.upgradeUnlocked(u, save.best)) return false;
      var cost = u.cost(lvl);
      if (save.salvage < cost) return false;
      save.salvage -= cost;
      save.up[u.key] = lvl + 1;
      G.persist();
      return true;
    },
    newRun: function () {
      save.wave = 1;
      G.persist();
    },

    go: function (key, data) {
      if (!G.phaser) { G.pendingScene = { key: key, data: data }; return; }
      var mgr = G.phaser.scene;
      if (mgr.isActive('boot')) { G.pendingScene = { key: key, data: data }; return; }
      var scenes = mgr.getScenes(true);
      for (var i = 0; i < scenes.length; i++) mgr.stop(scenes[i].scene.key);
      mgr.start(key, data || {});
    }
  };
  root.HFGame = G;

  /* -------------------------------------------------- verification hook -
   * Present from first script evaluation so a headless probe can read it
   * before any scene exists, and kept live by the play scene. */
  root.__hf = {
    version: HF.VERSION,
    state: G.verify,
    get save() { return save; },
    acts: HF.ACTS.map(function (a) {
      return { id: a.id, name: a.name, from: a.from, to: a.to, boss: a.boss.name, hazard: a.hazard.name };
    }),
    upgrades: HF.UPGRADES.map(function (u) { return { key: u.key, name: u.name, max: u.max }; }),
    squad: HF.SQUAD.map(function (s) { return { key: s.key, name: s.name, unlock: s.unlock }; }),
    forceMode: function (mode, arg) {
      if (mode === 'endless') { G.go('play', { mode: 'endless' }); return true; }
      if (mode === 'fall' || mode === 'play') {
        var w = HF.clamp((arg | 0) || save.wave, 1, HF.WAVES);
        if (w > save.best) { save.best = w; G.persist(); }
        G.go('play', { mode: 'fall', wave: w });
        return true;
      }
      if (mode === 'menu') { G.go('menu'); return true; }
      if (mode === 'shelter') { G.go('shelter'); return true; }
      if (mode === 'squad') { G.go('squad'); return true; }
      return false;
    },
    forceStage: function (n) {
      var w = HF.clamp(n | 0, 1, HF.WAVES);
      if (w > save.best) save.best = w;
      save.wave = w;
      G.persist();
      G.go('play', { mode: 'fall', wave: w });
      return true;
    },
    grantSalvage: function (n) {
      save.salvage = HF.clamp((save.salvage | 0) + (n | 0), 0, 99999999);
      G.persist();
      return save.salvage;
    },
    unlockAll: function () {
      save.best = HF.WAVES; save.cleared = HF.WAVES - 1; save.wave = HF.WAVES;
      G.persist();
      return true;
    },
    reset: function () {
      var d = HF.defaultSave();
      for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) save[k] = d[k];
      G.persist();
      return true;
    }
  };

  /* ------------------------------------------------------- scene tools - */
  function backdrop(scene, act) {
    var W = scene.scale.width, H = scene.scale.height;
    var key = 'hf_sky_' + act.id + '_' + Math.round(W) + 'x' + Math.round(H);
    if (!scene.textures.exists(key)) HFArt.bakeSky(scene, key, W, H, act);
    var img = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(-10);
    img.setDisplaySize(W, H);
    return img;
  }

  /* A slice of the wall the player is defending, used to close out the
   * bottom of every menu screen with authored art instead of empty ground. */
  function approachBand(scene, act, topY) {
    var W = scene.scale.width, H = scene.scale.height;
    var ins = HFUI.insets();
    var sceneH = Math.min(220, H - ins.bottom - topY - 26);
    if (sceneH < 96) return null;
    var laneW = Math.floor((W - 24) / 6);
    var laneX0 = Math.round((W - laneW * 6) / 2);
    var tk = HFArt.bakeTrack(scene, act, W, sceneH, 6, laneX0, laneW, 26);
    var sceneY = H - ins.bottom - sceneH;
    scene.add.image(0, sceneY, tk).setOrigin(0, 0).setDisplaySize(W, sceneH).setDepth(-6);
    var horde = [
      { sil: 'husk', lane: 1, p: 0.52, s: 46 },
      { sil: 'mite', lane: 3, p: 0.34, s: 32 },
      { sil: 'darter', lane: 4, p: 0.66, s: 34 },
      { sil: 'mite', lane: 5, p: 0.22, s: 28 }
    ];
    for (var m = 0; m < horde.length; m++) {
      var mm = horde[m];
      var img = scene.add.image(laneX0 + (mm.lane + 0.5) * laneW,
        sceneY + mm.p * (sceneH - 26), 'hf_m_' + mm.sil).setDepth(-5);
      img.setDisplaySize(mm.s, mm.s);
      img.setTint(act.hordeTint).setAlpha(0.92);
    }
    scene.add.image(0, sceneY, 'hf_flash').setOrigin(0, 0)
      .setDisplaySize(W, 26).setTint(0x0E131E).setAlpha(0.55).setDepth(-4);
    return sceneY;
  }

  function bindMenuKeys(scene, nav, onBack) {
    scene.input.keyboard.on('keydown', function (e) {
      if (kit.paused) return;
      var k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowRight' || k === 's' || k === 'd') { e.preventDefault(); nav.active = true; nav.move(1); }
      else if (k === 'ArrowUp' || k === 'ArrowLeft' || k === 'w' || k === 'a') { e.preventDefault(); nav.active = true; nav.move(-1); }
      else if (k === 'Enter' || k === ' ') { e.preventDefault(); if (nav.active) nav.activate(); }
      else if (k === 'Escape') { if (onBack) onBack(); }
      else if (k === 'm' || k === 'M') { G.toggleMute(); }
    });
  }

  function header(scene, title, sub) {
    var W = scene.scale.width;
    var ins = HFUI.insets(true);
    var t = HFUI.text(scene, W / 2, ins.top + 26, title, 27, '#FFD98A', 800).setOrigin(0.5, 0.5);
    if (sub) HFUI.text(scene, W / 2, ins.top + 52, sub, 14, '#9FB3C8', 600).setOrigin(0.5, 0.5);
    return t;
  }

  /* ------------------------------------------------------------- BOOT -- */
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'boot' }); },
    create: function () {
      var self = this;
      G.verify.scene = 'boot';
      var vw = document.documentElement.clientWidth || window.innerWidth;
      var vh = document.documentElement.clientHeight || window.innerHeight;
      if (vw > 0 && vh > 0 && (Math.abs(this.scale.width - vw) > 1 || Math.abs(this.scale.height - vh) > 1)) {
        this.scale.resize(vw, vh);
      }
      kit.loader.show('Hivefall');
      kit.loader.progress(0.12);
      HFArt.bakeStatic(this);
      kit.loader.progress(0.62);
      /* warm the first wave script and the act chrome the menu will show */
      HF.genWave(HF.clamp(save.wave, 1, HF.WAVES), 6, false);
      kit.loader.progress(0.78);

      var done = false;
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
      }
      /* an audio decode must never be able to hold the title on the loader */
      this.time.delayedCall(2600, proceed);
      kit.audio.preload(['click', 'swap', 'match', 'invalid', 'shot']).then(proceed, proceed);
      root.addEventListener('pointerdown', function () { G.unlock(); }, { once: true, passive: true });
      root.addEventListener('keydown', function () { G.unlock(); }, { once: true });
      kit.registerPWA();
    }
  });

  /* ------------------------------------------------------------- MENU -- */
  var MenuScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function MenuScene() { Phaser.Scene.call(this, { key: 'menu' }); },
    create: function () {
      var self = this;
      G.verify.scene = 'menu'; G.verify.mode = 'menu'; G.verify.over = false;
      var W = this.scale.width, H = this.scale.height;
      var ins = HFUI.insets(true);
      var act = HF.actForWave(save.wave);
      backdrop(this, act);

      HFUI.text(this, W / 2, ins.top + 62, 'HIVEFALL', 40, '#FFD98A', 800).setOrigin(0.5, 0.5);
      HFUI.text(this, W / 2, ins.top + 94, 'Match the board, hold the wall', 14, '#CBDAEA', 600).setOrigin(0.5, 0.5);

      /* act progress strip: four authored acts, cleared count each */
      var stripY = ins.top + 130;
      for (var i = 0; i < HF.ACTS.length; i++) {
        var a = HF.ACTS[i];
        var cx = W / 2 + (i - 1.5) * 76;
        var cleared = HF.clamp(save.cleared - a.from + 1, 0, 10);
        var chip = this.add.image(cx, stripY, 'hf_chip').setDisplaySize(68, 52).setAlpha(0.9);
        HFUI.setTint(chip, save.best >= a.from ? 0xFFFFFF : 0x7C8AA0);
        HFUI.text(this, cx, stripY - 10, 'Act ' + (i + 1), 12, save.best >= a.from ? '#CBDAEA' : '#6C7C92', 700).setOrigin(0.5, 0.5);
        HFUI.text(this, cx, stripY + 9, cleared + ' / 10', 14,
          cleared >= 10 ? '#8CE8A4' : (save.best >= a.from ? '#FFD98A' : '#6C7C92'), 800).setOrigin(0.5, 0.5);
      }

      var nav = HFUI.Nav();
      var by = Math.max(stripY + 80, Math.min(H * 0.50, H - 300));
      var bw = Math.min(300, W * 0.8);
      var resume = save.wave > 1 || save.cleared > 0;
      nav.add(HFUI.Button(this, {
        x: W / 2, y: by, w: bw, h: 62, kind: 'go', fs: 18,
        label: resume ? ('Continue - wave ' + save.wave) : 'Start the Fall',
        sub: HF.actForWave(save.wave).name,
        onTap: function () { G.audio('click'); G.go('play', { mode: 'fall', wave: save.wave }); }
      }));
      nav.add(HFUI.Button(this, {
        x: W / 2, y: by + 66, w: bw, h: 50, kind: 'main', fs: 16, icon: 'flame',
        label: 'Endless Night',
        sub: save.endlessBest ? ('best ' + save.endlessBest) : 'survive as long as you can',
        onTap: function () { G.audio('click'); G.go('play', { mode: 'endless' }); }
      }));
      nav.add(HFUI.Button(this, {
        x: W / 2, y: by + 124, w: bw, h: 46, kind: 'main', fs: 16, icon: 'wall',
        label: 'Shelter',
        onTap: function () { G.audio('click'); G.go('shelter'); }
      }));
      nav.add(HFUI.Button(this, {
        x: W / 2, y: by + 178, w: bw, h: 46, kind: 'main', fs: 16, icon: 'cross',
        label: 'Squad',
        onTap: function () { G.audio('click'); G.go('squad'); }
      }));
      nav.add(HFUI.Button(this, {
        x: W / 2, y: by + 232, w: bw, h: 44, kind: 'ghost', fs: 15, icon: 'vent',
        label: 'Settings',
        onTap: function () { G.audio('click'); G.openSettings(); }
      }));

      /* the approach: a live-looking slice of the wall the buttons defend */
      approachBand(this, act, by + 256);

      if (save.runs > 0) {
        HFUI.text(this, W / 2, H - ins.bottom - 34, 'Campaigns held: ' + save.runs, 13, '#CBDAEA', 700)
          .setOrigin(0.5, 0.5);
      }
      HFUI.text(this, W / 2, H - ins.bottom - 14, 'Everything here is earned by playing', 12, '#8FA4BB', 500)
        .setOrigin(0.5, 0.5);

      bindMenuKeys(this, nav, null);
      G.music('theme_watch');
      G.verify.stage = save.wave;
      G.verify.progress = Math.round(100 * save.cleared / HF.WAVES);
    }
  });

  /* ---------------------------------------------------------- SHELTER -- */
  var ShelterScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function ShelterScene() { Phaser.Scene.call(this, { key: 'shelter' }); },
    create: function () {
      var self = this;
      G.verify.scene = 'shelter'; G.verify.mode = 'shelter';
      var W = this.scale.width, H = this.scale.height;
      var ins = HFUI.insets(true);
      var act = HF.actForWave(save.wave);
      backdrop(this, act);

      this.rows = [];
      this.listTop = ins.top + 96;
      this.listBot = H - ins.bottom - 84;
      this.scroll = 0;

      var salvText = HFUI.text(this, W - 14 - ins.right, ins.top + 26, String(save.salvage), 20, '#F7C948', 800)
        .setOrigin(1, 0.5);
      this.add.image(salvText.x - salvText.width - 12, ins.top + 26, 'hf_ic_gear')
        .setDisplaySize(19, 19).setTint(0xF7C948);
      this.salvText = salvText;
      HFUI.text(this, 14 + ins.left, ins.top + 18, 'Shelter', 22, '#FFD98A', 800).setOrigin(0, 0.5);
      HFUI.text(this, 14 + ins.left, ins.top + 42, 'Next: wave ' + save.wave + ' - ' + act.name, 13, '#9FB3C8', 600)
        .setOrigin(0, 0.5);

      /* wave preview: what the next wave is bringing */
      var script = HF.genWave(save.wave, 6, false);
      var sum = HF.waveSummary(script);
      var px = 14 + ins.left, py = ins.top + 70;
      var parts = [];
      for (var s = 0; s < sum.length && s < 2; s++) {
        parts.push(HF.kind(sum[s].kind).name + ' x' + sum[s].n);
      }
      if (script.boss) parts.push(script.boss.name);
      HFUI.text(this, px, py, parts.join('   '), 13,
        script.boss ? '#F25C68' : '#CBDAEA', 650).setOrigin(0, 0.5);

      /* upgrade rows */
      var listW = W - 24;
      for (var i = 0; i < HF.UPGRADES.length; i++) this.rows.push(this.makeRow(HF.UPGRADES[i], 12, listW));
      this.layoutRows();

      /* footer: deploy */
      var footY = H - ins.bottom - 44;
      var nav = HFUI.Nav();
      this.footBg = this.add.image(0, footY - 30, 'hf_flash').setOrigin(0, 0)
        .setDisplaySize(W, H - (footY - 30)).setTint(0x0B111B).setAlpha(0.94).setDepth(10);
      var deploy = HFUI.Button(this, {
        x: W / 2 - 58, y: footY, w: Math.min(200, W * 0.52), h: 58, kind: 'go', fs: 18,
        label: 'Deploy',
        onTap: function () { G.audio('click'); G.go('play', { mode: 'fall', wave: save.wave }); }
      });
      deploy.img.setDepth(11); deploy.label.setDepth(12);
      var back = HFUI.Button(this, {
        x: W - 14 - ins.right - 48, y: footY, w: 96, h: 58, kind: 'ghost', fs: 15,
        label: 'Menu',
        onTap: function () { G.audio('click'); G.go('menu'); }
      });
      back.img.setDepth(11); back.label.setDepth(12);
      nav.add(deploy); nav.add(back);
      bindMenuKeys(this, nav, function () { G.go('menu'); });

      /* drag and wheel scrolling over the list area */
      this.input.on('pointerdown', function (p) {
        if (p.y < self.listTop || p.y > self.listBot) return;
        self.dragging = true; self.dragY = p.y; self.dragFrom = self.scroll;
      });
      this.input.on('pointermove', function (p) {
        if (!self.dragging) return;
        self.scroll = self.dragFrom + (p.y - self.dragY);
        self.layoutRows();
      });
      function endDrag() { self.dragging = false; }
      this.input.on('pointerup', endDrag);
      this.input.on('pointerupoutside', endDrag);
      this.input.on('wheel', function (p, over, dx, dy) {
        self.scroll -= dy * 0.5;
        self.layoutRows();
      });

      G.music('theme_shelter');
      G.verify.stage = save.wave;
    },

    makeRow: function (u, x, w) {
      var self = this;
      var row = {
        u: u,
        bg: this.add.image(0, 0, 'hf_btn').setOrigin(0, 0.5),
        icon: this.add.image(0, 0, 'hf_ic_' + u.icon).setDisplaySize(22, 22),
        name: HFUI.text(this, 0, 0, u.name, 15, '#EAF2FB', 750),
        desc: HFUI.text(this, 0, 0, u.desc, 12, '#93A7BD', 550),
        cost: HFUI.text(this, 0, 0, '', 14, '#F7C948', 800).setOrigin(1, 0.5),
        pips: []
      };
      for (var i = 0; i < u.max; i++) {
        row.pips.push(this.add.image(0, 0, 'hf_px').setDisplaySize(7, 7).setTint(0x2B3A4F));
      }
      row.bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, row.bg.width, row.bg.height),
        Phaser.Geom.Rectangle.Contains);
      row.bg.on('pointerup', function () {
        if (self.dragging) return;
        var unlocked = HF.upgradeUnlocked(u, save.best);
        if (!unlocked) { G.audio('invalid'); return; }
        if (G.buy(u)) {
          G.audio('salvage');
          HFUI.setText(self.salvText, String(save.salvage));
          self.layoutRows();
        } else {
          G.audio('invalid');
        }
      });
      return row;
    },

    layoutRows: function () {
      var W = this.scale.width;
      var ins = HFUI.insets();
      var rowH = 58, gap = 8;
      var total = this.rows.length * (rowH + gap);
      var view = this.listBot - this.listTop;
      var min = Math.min(0, view - total);
      this.scroll = HF.clamp(this.scroll, min, 0);
      var x = 12 + ins.left, w = W - 24 - ins.left - ins.right;
      for (var i = 0; i < this.rows.length; i++) {
        var row = this.rows[i];
        var y = this.listTop + this.scroll + i * (rowH + gap) + rowH / 2;
        var vis = y > this.listTop - rowH * 0.5 && y < this.listBot + rowH * 0.5;
        var u = row.u;
        var lvl = save.up[u.key] | 0;
        var unlocked = HF.upgradeUnlocked(u, save.best);
        var maxed = lvl >= u.max;
        var cost = u.cost(lvl);
        var afford = unlocked && !maxed && save.salvage >= cost;

        row.bg.setVisible(vis).setPosition(x, y).setDisplaySize(w, rowH);
        row.bg.setTexture(afford ? 'hf_btn' : 'hf_btn_dim');
        row.bg.input && (row.bg.input.enabled = vis);
        row.icon.setVisible(vis).setPosition(x + 26, y);
        row.icon.setTint(maxed ? 0x8CE8A4 : (unlocked ? (afford ? 0xFFD98A : 0x8FA4BB) : 0x66788D));
        row.name.setVisible(vis).setPosition(x + 48, y - 15);
        HFUI.setColor(row.name, unlocked ? '#EAF2FB' : '#67788D');
        row.desc.setVisible(vis).setPosition(x + 48, y + 4);
        HFUI.setText(row.desc, unlocked ? u.desc : ('Unlocks at wave ' + u.unlock));
        row.cost.setVisible(vis).setPosition(x + w - 12, y - 12);
        HFUI.setText(row.cost, !unlocked ? 'locked' : (maxed ? 'max' : String(cost)));
        HFUI.setColor(row.cost, maxed ? '#8CE8A4' : (afford ? '#F7C948' : '#7E8FA5'));
        for (var p = 0; p < row.pips.length; p++) {
          var pip = row.pips[p];
          var pw = u.max > 4 ? 7 : 11;
          pip.setVisible(vis).setPosition(x + w - 12 - (u.max - p) * (pw + 3), y + 12)
            .setDisplaySize(pw, 7);
          pip.setTint(p < lvl ? 0xF7C948 : (unlocked ? 0x35485F : 0x28313F));
        }
      }
    }
  });

  /* ------------------------------------------------------------ SQUAD -- */
  var SquadScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function SquadScene() { Phaser.Scene.call(this, { key: 'squad' }); },
    create: function () {
      G.verify.scene = 'squad'; G.verify.mode = 'squad';
      var W = this.scale.width, H = this.scale.height;
      var ins = HFUI.insets(true);
      backdrop(this, HF.actForWave(save.wave));
      header(this, 'The Squad', 'Match a colour, fire that survivor');

      var top = ins.top + 84;
      var rowH = Math.min(92, (H - top - ins.bottom - 92) / HF.SQUAD.length);
      for (var i = 0; i < HF.SQUAD.length; i++) {
        var sq = HF.SQUAD[i];
        var y = top + i * rowH + rowH / 2;
        var unlocked = save.best >= sq.unlock;
        var card = this.add.image(W / 2, y, 'hf_card').setDisplaySize(W - 28, rowH - 8);
        card.setAlpha(unlocked ? 1 : 0.8);
        this.add.image(30 + ins.left, y, unlocked ? ('hf_badge_' + sq.key) : ('hf_badge_' + sq.key + '_lock'))
          .setDisplaySize(52, 52);
        HFUI.text(this, 66 + ins.left, y - 21, sq.name + '  -  ' + sq.role, 16,
          unlocked ? '#EAF2FB' : '#7C8AA0', 750);
        HFUI.text(this, 66 + ins.left, y + 1,
          unlocked ? sq.line : ('Joins the squad at wave ' + sq.unlock), 13,
          unlocked ? '#9FB3C8' : '#6C7C92', 550);
        var tag = unlocked ? 'ready' : 'locked';
        HFUI.text(this, W - 22 - ins.right, y + 20, tag, 12,
          unlocked ? '#8CE8A4' : '#6C7C92', 700).setOrigin(1, 0.5);
      }

      var nav = HFUI.Nav();
      nav.add(HFUI.Button(this, {
        x: W / 2, y: H - ins.bottom - 40, w: Math.min(240, W * 0.66), h: 54, kind: 'main', fs: 16,
        label: 'Back', onTap: function () { G.audio('click'); G.go('menu'); }
      }));
      bindMenuKeys(this, nav, function () { G.go('menu'); });
    }
  });

  /* ----------------------------------------------------------- RESULT -- */
  var ResultScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function ResultScene() { Phaser.Scene.call(this, { key: 'result' }); },
    init: function (data) { this.data_ = data || {}; },
    create: function () {
      var d = this.data_;
      G.verify.scene = 'result'; G.verify.mode = d.mode || 'fall'; G.verify.over = true;
      var W = this.scale.width, H = this.scale.height;
      var ins = HFUI.insets(true);
      var act = HF.actForWave(d.wave || 1);
      backdrop(this, act);

      var win = !!d.win;
      var done = !!d.done;
      var title = d.mode === 'endless' ? 'Night over'
        : (done ? 'The Hive falls' : (win ? 'Wave cleared' : 'Wall breached'));
      var color = (win || d.mode === 'endless') ? '#FFD98A' : '#F25C68';
      HFUI.text(this, W / 2, ins.top + 66, title, 30, color, 800).setOrigin(0.5, 0.5);

      var lines = [];
      if (d.mode === 'endless') {
        lines.push(['Nights held', String(HF.clamp((d.wave | 0) - (d.win ? 0 : 1), 0, 9999))]);
        lines.push(['Score', String(d.score | 0)]);
        lines.push(['Best score', String(save.endlessBest | 0)]);
        lines.push(['Kills', String(d.kills | 0)]);
      } else {
        lines.push(['Wave', (d.wave | 0) + ' / ' + HF.WAVES]);
        lines.push(['Act', act.name]);
        lines.push(['Kills', String(d.kills | 0)]);
        if (win) lines.push(['Clear bonus', '+' + (d.bonus | 0)]);
        lines.push(['Salvage', String(save.salvage)]);
      }
      if (d.boss) lines.push(['Horror down', d.boss]);

      var cardH = 44 + lines.length * 26;
      var cy = ins.top + 118 + cardH / 2;
      this.add.image(W / 2, cy, 'hf_card').setDisplaySize(Math.min(330, W - 28), cardH);
      for (var i = 0; i < lines.length; i++) {
        var y = cy - cardH / 2 + 30 + i * 26;
        HFUI.text(this, W / 2 - Math.min(330, W - 28) / 2 + 18, y, lines[i][0], 14, '#9FB3C8', 600).setOrigin(0, 0.5);
        HFUI.text(this, W / 2 + Math.min(330, W - 28) / 2 - 18, y, lines[i][1], 15, '#EAF2FB', 750).setOrigin(1, 0.5);
      }

      var nav = HFUI.Nav();
      var by = Math.min(H - ins.bottom - 200, cy + cardH / 2 + 40);
      var bw = Math.min(280, W * 0.76);
      if (d.mode === 'endless') {
        nav.add(HFUI.Button(this, {
          x: W / 2, y: by, w: bw, h: 58, kind: 'go', fs: 17, label: 'Run it again',
          onTap: function () { G.audio('click'); G.go('play', { mode: 'endless' }); }
        }));
        nav.add(HFUI.Button(this, {
          x: W / 2, y: by + 70, w: bw, h: 52, kind: 'main', fs: 16, label: 'Shelter',
          onTap: function () { G.audio('click'); G.go('shelter'); }
        }));
      } else if (done) {
        nav.add(HFUI.Button(this, {
          x: W / 2, y: by, w: bw, h: 58, kind: 'go', fs: 17, label: 'Start a new Fall',
          onTap: function () { G.audio('click'); G.newRun(); G.go('shelter'); }
        }));
        nav.add(HFUI.Button(this, {
          x: W / 2, y: by + 70, w: bw, h: 52, kind: 'main', fs: 16, label: 'Endless Night',
          onTap: function () { G.audio('click'); G.go('play', { mode: 'endless' }); }
        }));
      } else if (win) {
        nav.add(HFUI.Button(this, {
          x: W / 2, y: by, w: bw, h: 58, kind: 'go', fs: 17, label: 'Next wave',
          onTap: function () { G.audio('click'); G.go('play', { mode: 'fall', wave: save.wave }); }
        }));
        nav.add(HFUI.Button(this, {
          x: W / 2, y: by + 70, w: bw, h: 52, kind: 'main', fs: 16, icon: 'wall', label: 'Shelter',
          onTap: function () { G.audio('click'); G.go('shelter'); }
        }));
      } else {
        nav.add(HFUI.Button(this, {
          x: W / 2, y: by, w: bw, h: 58, kind: 'go', fs: 17, label: 'Hit it again',
          onTap: function () { G.audio('click'); G.go('play', { mode: 'fall', wave: save.wave }); }
        }));
        nav.add(HFUI.Button(this, {
          x: W / 2, y: by + 70, w: bw, h: 52, kind: 'main', fs: 16, icon: 'wall', label: 'Spend salvage',
          onTap: function () { G.audio('click'); G.go('shelter'); }
        }));
      }
      nav.add(HFUI.Button(this, {
        x: W / 2, y: by + 132, w: bw, h: 48, kind: 'ghost', fs: 15, label: 'Menu',
        onTap: function () { G.audio('click'); G.go('menu'); }
      }));
      bindMenuKeys(this, nav, function () { G.go('menu'); });

      /* squad unlock is a run boundary beat, so it earns a banner line */
      var joins = HF.squadUnlockedAt(save.best);
      if (win && joins.length) {
        HFUI.text(this, W / 2, by + 172, joins[0].name + ' joins the squad', 14, '#8CE8A4', 700)
          .setOrigin(0.5, 0.5);
      }
      approachBand(this, act, by + 190);
      G.music(win ? 'theme_watch' : 'theme_shelter');
    }
  });

  /* ------------------------------------------------------------- game -- */
  function start() {
    G.phaser = new Phaser.Game({
      type: Phaser.AUTO,
      parent: document.body,
      backgroundColor: '#0E131E',
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
        width: document.documentElement.clientWidth || window.innerWidth,
        height: document.documentElement.clientHeight || window.innerHeight
      },
      render: { antialias: true, powerPreference: 'high-performance' },
      audio: { noAudio: true },      /* all audio runs through the GGKit bus */
      scene: [BootScene, MenuScene, ShelterScene, SquadScene, ResultScene, HFPlayScene]
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') start();
  else document.addEventListener('DOMContentLoaded', start);
})(window);
