/* Kinetic Burst - GGKit lifecycle, menus, meta scenes, boot, verify hook. */
(function (root) {
  'use strict';

  var AUDIO = {
    ui_click: 'assets/ui_click.mp3',
    link: 'assets/link.mp3',
    trace_open: 'assets/trace_open.mp3',
    invalid: 'assets/invalid.mp3',
    pop: 'assets/pop.mp3',
    cascade: 'assets/cascade.mp3',
    strike: 'assets/strike.mp3',
    crit: 'assets/crit.mp3',
    heal: 'assets/heal.mp3',
    charge_full: 'assets/charge_full.mp3',
    super: 'assets/super.mp3',
    clash_hit: 'assets/clash_hit.mp3',
    hurt: 'assets/hurt.mp3',
    down: 'assets/down.mp3',
    victory: 'assets/victory.mp3',
    defeat: 'assets/defeat.mp3',
    unlock: 'assets/unlock.mp3',
    wave: 'assets/wave.mp3',
    theme_road: 'assets/theme_road.mp3',
    theme_core: 'assets/theme_core.mp3'
  };
  var DPR = 1;

  function cssViewport() { return { width: document.documentElement.clientWidth || 390, height: document.documentElement.clientHeight || 844 }; }
  function prepareCamera(scene) { var w = scene.scale.width / DPR, h = scene.scale.height / DPR; scene.cameras.main.setZoom(DPR).centerOn(w / 2, h / 2); }
  root.__KB_DENSE_CAMERA = prepareCamera;

  /* ---------------------------------------------------------------- kit */
  var kit = GGKit.create({
    slug: 'kinetic-burst',
    orientation: 'portrait',
    validateSave: KB.validateSave,
    onPause: function () {
      var g = root.KBGame;
      if (g && g.phaser && g.phaser.scene.isActive('play')) g.phaser.scene.pause('play');
    },
    onResume: function () {
      var g = root.KBGame;
      if (g && g.phaser && g.phaser.scene.isPaused('play')) g.phaser.scene.resume('play');
    },
    onRestart: function () {
      var g = root.KBGame;
      if (g && g.phaser && g.phaser.scene.isActive('play')) {
        g.phaser.scene.getScene('play').restart();
      }
    }
  });
  kit.audio.register(AUDIO);
  if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    kit.juice.enabled = false;
  }

  var save = KB.normalizeSave(kit.save.get(null));

  /* -------------------------------------------------------------- state */
  var G = {
    kit: kit,
    save: save,
    phaser: null,
    unlocked: false,
    pendingMusic: null,
    pendingScene: null,
    verify: {
      scene: 'boot', mode: 'none', stage: -1, trial: -1, turn: 0, wave: 0,
      hp: 100, score: 0, over: false, won: false, enemies: 0, alive: 0, phase: 'boot', fx: null
    },

    persist: function () { kit.save.set(save); },

    audio: function (name, opts) {
      if (!G.unlocked) return;
      kit.audio.sfx(name, opts);
    },
    music: function (name) {
      if (!G.unlocked) { G.pendingMusic = name; return; }
      kit.audio.music(name, 700);
    },
    unlock: function () {
      if (G.unlocked) return;
      G.unlocked = true;
      if (G.pendingMusic) { kit.audio.music(G.pendingMusic, 700); G.pendingMusic = null; }
    },
    toggleMute: function () { kit.audio.setMute(!kit.audio.prefs.mute); },

    /* ------------------------------------------------------ progression */
    grantXp: function (amount) {
      var levels = [];
      for (var i = 0; i < 3; i++) {
        var id = KB.clamp(save.team[i] | 0, 0, KB.FIGHTER_COUNT - 1);
        var before = KB.level(save.xp[id]);
        save.xp[id] = KB.clamp((save.xp[id] | 0) + amount, 0, KB.M.xpPerLevel * KB.M.maxLevel * 4);
        var after = KB.level(save.xp[id]);
        if (after > before) levels.push({ id: id, from: before, to: after });
      }
      return levels;
    },

    recordWin: function (mode, idx, turns, score) {
      var reward = { xp: 0, levels: [], unlocked: [], crown: false, best: false };
      if (mode === 'endless') { G.recordEndless(score, idx); return reward; }
      if (mode === 'trial') {
        idx = KB.clamp(idx, 0, KB.TRIAL_COUNT - 1);
        if (!save.trials[idx]) reward.best = true;
        save.trials[idx] = 1;
        reward.xp = 140 + idx * 30;
        reward.levels = G.grantXp(reward.xp);
        G.persist();
        return reward;
      }
      idx = KB.clamp(idx, 0, KB.STAGE_COUNT - 1);
      var st = KB.stage(idx);
      if (!save.cleared[idx] || turns < (save.turns[idx] || 9999)) {
        if (!save.turns[idx] || turns < save.turns[idx]) { save.turns[idx] = turns; reward.best = true; }
      }
      var first = !save.cleared[idx];
      save.cleared[idx] = 1;
      reward.xp = first ? st.xp : Math.round(st.xp * 0.4);
      reward.levels = G.grantXp(reward.xp);
      var ids = KB.unlockedBy(idx);
      for (var i = 0; i < ids.length; i++) {
        if (!save.roster[ids[i]]) { save.roster[ids[i]] = 1; reward.unlocked.push(ids[i]); }
      }
      if (!save.crown && KB.clearedCount(save) >= KB.STAGE_COUNT) { save.crown = 1; reward.crown = true; }
      G.persist();
      return reward;
    },

    recordEndless: function (score, wave) {
      if ((score | 0) > save.endBest) save.endBest = score | 0;
      if ((wave | 0) > save.endWave) save.endWave = wave | 0;
      G.persist();
    },

    setTeamSlot: function (slot, fid) {
      if (!save.roster[fid]) return false;
      var team = save.team.slice();
      var at = team.indexOf(fid);
      if (at >= 0) { team[at] = team[slot]; }
      team[slot] = fid;
      save.team = team;
      G.persist();
      return true;
    },

    markTutorialDone: function () {
      if (save.tutorial) return;
      save.tutorial = 1;
      G.persist();
    },

    /* ------------------------------------------------------- scene flow */
    go: function (key, data) {
      if (!G.phaser) { G.pendingScene = { key: key, data: data }; return; }
      var mgr = G.phaser.scene;
      if (mgr.isActive('boot')) { G.pendingScene = { key: key, data: data }; return; }
      var scenes = mgr.getScenes(true);
      for (var i = 0; i < scenes.length; i++) mgr.stop(scenes[i].scene.key);
      mgr.start(key, data || {});
    },

    /* -------------------------------------------------- DOM overlays --- */
    openPause: function (opts) {
      opts = opts || {};
      kit.pause('menu');
      var box = document.createElement('div');
      box.className = 'kb-overlay';
      var h = document.createElement('div');
      h.className = 'kb-h';
      h.textContent = 'Paused';
      box.appendChild(h);
      function btn(label, primary, fn) {
        var b = document.createElement('button');
        b.className = 'kb-btn' + (primary ? ' kb-primary' : '');
        b.textContent = label;
        b.addEventListener('click', function () { fn(); });
        box.appendChild(b);
        return b;
      }
      btn('Resume', true, function () { close(); });
      btn('Numbers', false, function () { G.openNumbers(); });
      btn('Settings', false, function () { kit.openSettings(); });
      if (opts.onRestart) btn('Restart stage', false, function () { close(); opts.onRestart(); });
      if (opts.onQuit) btn('Leave the fight', false, function () { close(); opts.onQuit(); });
      document.body.appendChild(box);
      function close() {
        if (box.parentNode) box.parentNode.removeChild(box);
        kit.resume('menu');
      }
      return box;
    },

    /* The prototype's MATH panel: every rate and formula the sim uses. */
    openNumbers: function () {
      kit.pause('numbers');
      var M = KB.M;
      var rows = [
        ['Board', M.cols + ' by ' + M.rows + ', heart orbs ' + Math.round(M.heartRate * 100) + ' percent of draws'],
        ['Run', 'a run scores at ' + M.minRun + ' or more same type orbs, path cap ' + M.maxPath],
        ['Trace timer', M.traceTime + 's, plus 1.5s with Nix Aravel'],
        ['Chain', '1.00 plus ' + M.comboStep.toFixed(2) + ' for every extra scoring run'],
        ['Damage', 'attack x orbs x ' + M.damagePerOrb + ' x chain x ki multiplier'],
        ['Ki triangle', 'Power beats Speed beats Focus beats Power, x1.50 / x1.00 / x0.67'],
        ['Charge', M.chargePerOrb + ' per orb, plus ' + M.chargeBonusPerExtra + ' per orb over ' + M.minRun],
        ['Burst', 'ready at ' + M.fullCharge + ' charge, Ashen Moro banks to ' + M.overcap],
        ['Clash', 'window ' + M.clashWindow + 's, x' + M.clashPerfect.toFixed(2) + ' perfect, x' +
          M.clashGood.toFixed(2) + ' good, x' + M.clashLate.toFixed(2) + ' late'],
        ['Heart run', M.healPerOrb + ' health per orb to the whole team'],
        ['Levels', 'level up every ' + M.xpPerLevel + ' xp to level ' + M.maxLevel +
          ', plus ' + Math.round(M.levelHp * 100) + ' percent health and ' + Math.round(M.levelAtk * 100) + ' percent attack'],
        ['Enemy hit', 'attack x ki multiplier, shown on the card one turn ahead']
      ];
      var box = document.createElement('div');
      box.className = 'kb-overlay kb-scroll';
      var h = document.createElement('div');
      h.className = 'kb-h';
      h.textContent = 'Numbers';
      box.appendChild(h);
      for (var i = 0; i < rows.length; i++) {
        var r = document.createElement('div');
        r.className = 'kb-row';
        var a = document.createElement('b');
        a.textContent = rows[i][0];
        var b2 = document.createElement('span');
        b2.textContent = rows[i][1];
        r.appendChild(a); r.appendChild(b2);
        box.appendChild(r);
      }
      var close = document.createElement('button');
      close.className = 'kb-btn kb-primary';
      close.textContent = 'Back';
      close.addEventListener('click', function () {
        if (box.parentNode) box.parentNode.removeChild(box);
        kit.resume('numbers');
      });
      box.appendChild(close);
      document.body.appendChild(box);
      return box;
    }
  };
  root.KBGame = G;

  /* ------------------------------------------------------- verify hook */
  root.__kb = {
    version: KB.VERSION,
    state: G.verify,
    get save() { return save; },
    stages: KB.STAGE_COUNT,
    arcs: KB.ARCS.map(function (a) { return { id: a.id, name: a.name }; }),
    forceMode: function (mode, arg) {
      if (mode === 'road' || mode === 'stage') { G.go('play', { mode: 'road', stage: arg | 0 }); return true; }
      if (mode === 'endless') { G.go('play', { mode: 'endless' }); return true; }
      if (mode === 'trial') { G.go('play', { mode: 'trial', trial: arg | 0 }); return true; }
      if (mode === 'map') { G.go('map', { focus: arg | 0 }); return true; }
      if (mode === 'menu') { G.go('menu'); return true; }
      if (mode === 'roster') { G.go('roster'); return true; }
      if (mode === 'trials') { G.go('trials'); return true; }
      if (mode === 'crown') { G.go('crown'); return true; }
      return false;
    },
    forceStage: function (n) {
      G.go('play', { mode: 'road', stage: KB.clamp(n | 0, 0, KB.STAGE_COUNT - 1) });
      return true;
    },
    unlockAll: function () {
      for (var i = 0; i < KB.STAGE_COUNT; i++) save.cleared[i] = 1;
      for (var f = 0; f < KB.FIGHTER_COUNT; f++) save.roster[f] = 1;
      save.crown = 1;
      G.persist();
      return true;
    },
    reset: function () {
      var d = KB.defaultSave();
      for (var k in d) save[k] = d[k];
      G.persist();
      return true;
    }
  };

  /* --------------------------------------------------------------- BOOT */
  var BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene() { Phaser.Scene.call(this, { key: 'boot' }); },
    create: function () {
      var self = this;
      prepareCamera(this);
      G.verify.scene = 'boot';
      kit.loader.show('Kinetic Burst');
      kit.loader.progress(0.12);
      KBArt.bakeStatic(this);
      kit.loader.progress(0.5);
      /* warm the first arc board and backdrops so the opening tap is instant */
      KBArt.bakeBoard(this, 'kb_warm_board', 48, 8, KB.M.cols, KB.M.rows, KB.arc(0));
      for (var a = 0; a < KB.ARC_COUNT; a++) {
        KBArt.bakeSky(this, 'kb_sky_' + KB.arc(a).id, this.scale.width / DPR, this.scale.height / DPR, KB.arc(a));
      }
      KB.allStages();
      kit.loader.progress(0.8);

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
      this.time.delayedCall(2500, proceed);
      kit.audio.preload(['ui_click', 'link', 'pop', 'strike']).then(proceed, proceed);
      root.addEventListener('pointerdown', function () { G.unlock(); }, { once: true, passive: true });
      root.addEventListener('keydown', function () { G.unlock(); }, { once: true });
      kit.registerPWA();
    }
  });

  /* --------------------------------------------------------------- MENU */
  var MenuScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function MenuScene() { Phaser.Scene.call(this, { key: 'menu' }); },
    create: function () {
      var self = this;
      prepareCamera(this);
      G.verify.scene = 'menu'; G.verify.mode = 'menu'; G.verify.over = false;
      var W = this.scale.width / DPR, H = this.scale.height / DPR, ins = KBUI.insets();
      this.bg = KBUI.backdrop(this, KB.arc(save.crown ? 4 : 0), -20);
      G.music('theme_road');

      /* hero: three orbs on an orbit line, all baked textures */
      var hero = this.add.container(W / 2, Math.max(132, H * 0.19));
      var ring = this.add.image(0, 6, 'kb_ring');
      ring.setDisplaySize(190, 190).setTint(0x9A7CF3).setAlpha(0.5);
      hero.add(ring);
      var picks = [[0, -62, 8, 1.0], [2, 0, -26, 1.22], [1, 62, 10, 1.0]];
      for (var i = 0; i < picks.length; i++) {
        var im = this.add.image(picks[i][1], picks[i][2], KBArt.orbKey(picks[i][0], 'lit'));
        im.setDisplaySize(62 * picks[i][3], 62 * picks[i][3]);
        hero.add(im);
      }
      this.hero = hero;

      var titleY = Math.max(206, H * 0.19 + 96);
      KBUI.text(this, W / 2, titleY, 'KINETIC BURST', 30, 800, '#F7FBFF');
      KBUI.text(this, W / 2, titleY + 27, 'Trace the ki. Charge the team. Take the core.', 14, 600, '#B7C4DA');

      var cleared = KB.clearedCount(save);
      var next = KB.nextStage(save);
      var y = Math.max(titleY + 74, H * 0.44);
      var bw = Math.min(292, W - 56);

      KBUI.pill(this, {
        x: W / 2, y: y, w: bw, h: 56, fill: 0x38A8DE, icon: 'play',
        label: cleared === 0 ? 'Start the Burst Road' : ('Stage ' + (next + 1) + ' of 30'),
        onPress: function () { G.unlock(); G.audio('ui_click'); self.scene.start('map', { focus: next }); }
      });
      KBUI.pill(this, {
        x: W / 2, y: y + 66, w: bw, h: 52, fill: 0x2E4269, color: '#F7FBFF',
        icon: 'infinity', iconTint: 0xF7FBFF, label: 'Endless Surge',
        onPress: function () { G.unlock(); G.audio('ui_click'); self.scene.start('play', { mode: 'endless' }); }
      });
      var tOpen = KB.trialOpen(save, 0);
      KBUI.pill(this, {
        x: W / 2, y: y + 128, w: bw, h: 52, fill: tOpen ? 0x3A2F63 : 0x22304C, color: '#F7FBFF',
        icon: tOpen ? 'trial' : 'lock', iconTint: 0xF7FBFF,
        label: tOpen ? 'Trial Gauntlet' : ('Trials at ' + KB.trial(0).need + ' stages'),
        onPress: function () {
          G.unlock(); G.audio('ui_click');
          if (tOpen) self.scene.start('trials');
        }
      }).setEnabled(tOpen);
      KBUI.pill(this, {
        x: W / 2, y: y + 190, w: bw, h: 52, fill: 0x244A41, color: '#F7FBFF',
        icon: 'roster', iconTint: 0xF7FBFF,
        label: 'Roster  ' + KB.rosterCount(save) + ' of ' + KB.FIGHTER_COUNT,
        onPress: function () { G.unlock(); G.audio('ui_click'); self.scene.start('roster'); }
      });

      KBUI.text(this, W / 2, H - ins.bottom - 54,
        cleared + ' of 30 stages   best surge ' + save.endBest, 13, 650, '#9FB0CA');
      if (save.crown) {
        var cr = this.add.image(W / 2 - 86, H - ins.bottom - 80, 'kb_ic_crown');
        cr.setDisplaySize(20, 20).setTint(0xF7C948);
        KBUI.text(this, W / 2 + 10, H - ins.bottom - 80, 'Burst Core cleared', 13, 700, '#F7C948');
      }

      KBUI.button(this, {
        x: W - ins.right - 34, y: ins.top + 34, icon: 'gear', size: 44,
        onPress: function () { G.unlock(); kit.openSettings(); }
      });
      KBUI.button(this, {
        x: ins.left + 34, y: ins.top + 34, icon: kit.audio.prefs.mute ? 'mute' : 'sound', size: 44,
        onPress: function () { G.unlock(); G.toggleMute(); self.scene.restart(); }
      });
      KBUI.button(this, {
        x: W - ins.right - 34, y: ins.top + 90, icon: 'info', size: 44,
        onPress: function () { G.unlock(); G.audio('ui_click'); G.openNumbers(); }
      });

      this.onResize = function () { if (self.scene.isActive()) self.scene.restart(); };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize); });
    },
    update: function (time, delta) {
      if (kit.paused) return;
      var dt = Math.min(delta, 50) / 1000;
      if (this.bg) this.bg.update(dt);
      if (this.hero && kit.juice.enabled) this.hero.setY(this.hero.y + Math.sin(time / 700) * 0.06);
    }
  });

  /* ---------------------------------------------------------------- MAP */
  var MapScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function MapScene() { Phaser.Scene.call(this, { key: 'map' }); },
    init: function (data) {
      this.focus = KB.clamp((data && data.focus) | 0, 0, KB.STAGE_COUNT - 1);
    },
    create: function () {
      var self = this;
      prepareCamera(this);
      G.verify.scene = 'map'; G.verify.mode = 'map'; G.verify.over = false;
      var W = this.scale.width / DPR, H = this.scale.height / DPR;
      this.ins = KBUI.insets();
      var arcOf = (this.focus / 6) | 0;
      this.bg = KBUI.backdrop(this, KB.arc(arcOf), -20);

      this.headerH = this.ins.top + 52;
      this.rowH = 78;
      this.arcH = 44;
      this.contentH = KB.ARC_COUNT * (this.arcH + 3 * this.rowH) + this.headerH + 60;
      this.world = this.add.container(0, 0).setDepth(1);

      var cardW = Math.min(W - 28, 360);
      var nodeW = Math.floor((cardW - 16) / 2);
      KBArt.bakeCard(this, 'kb_node_open', nodeW, this.rowH - 10, 12, 0x223151, 0.96, 0x6B85B5, 0.6);
      KBArt.bakeCard(this, 'kb_node_done', nodeW, this.rowH - 10, 12, 0x1E4030, 0.96, 0x5BCB77, 0.7);
      KBArt.bakeCard(this, 'kb_node_lock', nodeW, this.rowH - 10, 12, 0x1A2137, 0.9, 0x3C4A66, 0.6);
      KBArt.bakeCard(this, 'kb_node_boss', nodeW, this.rowH - 10, 12, 0x40233F, 0.96, 0xF29A4A, 0.8);

      this.nodes = [];
      var y = this.headerH + 16;
      for (var a = 0; a < KB.ARC_COUNT; a++) {
        var arc = KB.arc(a);
        var head = KBUI.text(this, 16, y + 12, arc.name.toUpperCase(), 13, 800, '#F7FBFF');
        head.setOrigin(0, 0.5); head.setAlpha(0.9);
        this.world.add(head);
        var tag = KBUI.text(this, 16, y + 30, arc.tag, 11.5, 600, '#9FB0CA');
        tag.setOrigin(0, 0.5); tag.setAlpha(0.8);
        this.world.add(tag);
        var rule = this.add.image(0, y + 42, 'kb_white').setOrigin(0, 0);
        rule.setDisplaySize(W, 1).setTint(0xFFFFFF).setAlpha(0.14);
        this.world.add(rule);
        y += this.arcH;
        for (var s = 0; s < 6; s++) {
          var idx = a * 6 + s;
          var col = s % 2, rowi = (s / 2) | 0;
          var nx = (W - cardW) / 2 + col * (nodeW + 16) + nodeW / 2;
          var ny = y + rowi * this.rowH + (this.rowH - 10) / 2;
          this.nodes.push(this.buildNode(idx, nx, ny, nodeW));
        }
        y += 3 * this.rowH + 6;
      }
      this.contentH = y + 40;

      /* fixed header */
      var hdr = this.add.container(0, 0).setDepth(20);
      KBArt.bakeCard(this, 'kb_maphdr_' + Math.round(W), W, this.headerH, 0, 0x0D1425, 0.92, null, 0);
      hdr.add(this.add.image(0, 0, 'kb_maphdr_' + Math.round(W)).setOrigin(0, 0));
      KBUI.button(this, {
        x: this.ins.left + 32, y: this.ins.top + 24, icon: 'back', size: 44,
        onPress: function () { G.audio('ui_click'); self.scene.start('menu'); }
      }).root.setDepth(21);
      var t = KBUI.text(this, W / 2, this.ins.top + 24, 'Burst Road', 17, 800, '#F7FBFF');
      t.setDepth(21);
      var chip = KBUI.chip(this, {
        x: W - this.ins.right - 74, y: this.ins.top + 24, icon: 'star',
        value: KB.clearedCount(save) + '/30', w: 84, h: 32, tint: 0xF7C948
      });
      chip.root.setDepth(21);

      this.toast = KBUI.transients(this, this.add.container(0, 0).setDepth(30), {
        isLive: function () { return false; },
        reduced: function () { return !kit.juice.enabled; }
      });

      this.scrollMin = Math.min(0, H - this.contentH);
      this.scrollMax = 0;
      this.scrollY = KB.clamp(H * 0.4 - this.nodeYOf(this.focus), this.scrollMin, this.scrollMax);
      this.world.setY(Math.round(this.scrollY));
      this.vel = 0;
      this.drag = null;
      this.gest = KBUI.gestures(this, kit, {
        onDown: function (id, x, y2) {
          if (self.drag) return;
          self.drag = { id: id, x0: x, y0: y2, sy: self.scrollY, py: y2, pt: performance.now(), moved: 0 };
          self.vel = 0;
        },
        onMove: function (id, x, y2) {
          var d = self.drag;
          if (!d || d.id !== id) return;
          var now = performance.now();
          var dt = Math.max(8, now - d.pt) / 1000;
          self.vel = (y2 - d.py) / dt;
          d.py = y2; d.pt = now;
          d.moved = Math.max(d.moved, Math.abs(y2 - d.y0) + Math.abs(x - d.x0));
          self.scrollY = KB.clamp(d.sy + (y2 - d.y0), self.scrollMin, self.scrollMax);
          self.world.setY(Math.round(self.scrollY));
        },
        onUp: function (id, x, y2) {
          var d = self.drag;
          if (!d || d.id !== id) return;
          self.drag = null;
          if (d.moved >= 12 || d.y0 <= self.headerH) return;
          self.vel = 0;
          var py = d.y0 - self.scrollY;
          for (var i = 0; i < self.nodes.length; i++) {
            var n = self.nodes[i];
            if (Math.abs(d.x0 - n.x) <= n.w / 2 && Math.abs(py - n.y) <= (self.rowH - 10) / 2) {
              self.openNode(n.index);
              return;
            }
          }
        }
      });

      this.onResize = function () { if (self.scene.isActive()) self.scene.restart({ focus: self.focus }); };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize); });
    },

    nodeYOf: function (idx) {
      for (var i = 0; i < this.nodes.length; i++) if (this.nodes[i].index === idx) return this.nodes[i].y;
      return 0;
    },

    buildNode: function (idx, x, y, w) {
      var st = KB.stage(idx);
      var open = KB.stageOpen(save, idx);
      var done = !!save.cleared[idx];
      var c = this.add.container(x, y);
      var key = !open ? 'kb_node_lock' : (done ? 'kb_node_done' : (st.boss ? 'kb_node_boss' : 'kb_node_open'));
      c.add(this.add.image(0, 0, key));
      var num = KBUI.text(this, -w / 2 + 20, -12, String(idx + 1), 15, 800, open ? '#F7FBFF' : '#7C8CA8');
      num.setOrigin(0, 0.5);
      c.add(num);
      var nm = KBUI.text(this, -w / 2 + 20, 8, open ? st.name : 'Locked', 11.5, 700, open ? '#DCE6F5' : '#7C8CA8');
      nm.setOrigin(0, 0.5);
      nm.setWordWrapWidth(w - 46);
      c.add(nm);
      if (!open) {
        var lk = this.add.image(w / 2 - 18, -12, 'kb_ic_lock');
        lk.setDisplaySize(16, 16).setTint(0x7C8CA8);
        c.add(lk);
      } else if (done) {
        var st2 = this.add.image(w / 2 - 18, -12, 'kb_ic_star');
        st2.setDisplaySize(16, 16).setTint(0x5BCB77);
        c.add(st2);
        if (save.turns[idx] > 0) {
          c.add(KBUI.text(this, w / 2 - 18, 8, save.turns[idx] + 'T', 11, 700, '#8FBFA0'));
        }
      } else if (st.boss) {
        var bs = this.add.image(w / 2 - 18, -12, 'kb_ic_burst');
        bs.setDisplaySize(16, 16).setTint(0xF29A4A);
        c.add(bs);
      }
      this.world.add(c);
      return { root: c, index: idx, x: x, y: y, w: w };
    },

    openNode: function (idx) {
      if (!KB.stageOpen(save, idx)) {
        this.toast.chip('Clear stage ' + idx + ' first', {
          icon: 'lock', tint: 0xF7C948, x: this.scale.width / DPR / 2, y: this.headerH + 24, hold: 900
        });
        return;
      }
      G.unlock();
      G.audio('ui_click');
      this.scene.start('play', { mode: 'road', stage: idx });
    },

    update: function (time, delta) {
      if (kit.paused) return;
      var dt = Math.min(delta, 50) / 1000;
      if (this.bg) this.bg.update(dt);
      if (this.drag) return;
      if (Math.abs(this.vel) > 8) {
        this.scrollY = KB.clamp(this.scrollY + this.vel * dt, this.scrollMin, this.scrollMax);
        this.vel *= Math.pow(0.0025, dt);
        this.world.setY(Math.round(this.scrollY));
      } else if (this.vel !== 0) this.vel = 0;
    }
  });

  /* ------------------------------------------------------------- ROSTER */
  var RosterScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function RosterScene() { Phaser.Scene.call(this, { key: 'roster' }); },
    create: function () {
      var self = this;
      prepareCamera(this);
      G.verify.scene = 'roster'; G.verify.mode = 'roster'; G.verify.over = true;
      var W = this.scale.width / DPR, H = this.scale.height / DPR, ins = KBUI.insets();
      this.bg = KBUI.backdrop(this, KB.arc(1), -20);
      G.music('theme_road');
      this.slot = 0;

      KBUI.text(this, W / 2, ins.top + 26, 'Roster', 20, 800, '#F7FBFF');
      KBUI.button(this, {
        x: ins.left + 32, y: ins.top + 26, icon: 'back', size: 44,
        onPress: function () { G.audio('ui_click'); self.scene.start('menu'); }
      });

      /* three team slots */
      var slotY = ins.top + 84;
      var sw = Math.min(104, (W - 40) / 3);
      KBArt.bakeCard(this, 'kb_slot', sw, 58, 12, 0x223151, 0.96, 0x6B85B5, 0.6);
      KBArt.bakeCard(this, 'kb_slotsel', sw, 58, 12, 0x2E4269, 1, 0xF7FBFF, 0.95);
      this.slotCards = [];
      for (var i = 0; i < 3; i++) {
        (function (si) {
          var x = W / 2 + (si - 1) * (sw + 8);
          var c = self.add.container(x, slotY);
          var bg = self.add.image(0, 0, 'kb_slot');
          var sel = self.add.image(0, 0, 'kb_slotsel'); sel.setVisible(si === 0);
          c.add(bg); c.add(sel);
          var badge = self.add.image(-sw / 2 + 22, 0, KBArt.badgeKey(save.team[si]));
          badge.setDisplaySize(38, 38);
          c.add(badge);
          var nm = KBUI.text(self, -sw / 2 + 44, -8, KB.fighter(save.team[si]).name.split(' ')[0], 12, 750, '#F7FBFF');
          nm.setOrigin(0, 0.5); c.add(nm);
          var lv = KBUI.text(self, -sw / 2 + 44, 10, 'Lv ' + KB.level(save.xp[save.team[si]]), 11.5, 700, '#9FB0CA');
          lv.setOrigin(0, 0.5); c.add(lv);
          c.setSize(sw, 58);
          c.setInteractive(new Phaser.Geom.Rectangle(-sw / 2, -29, sw, 58), Phaser.Geom.Rectangle.Contains);
          c.on('pointerup', function () { G.unlock(); G.audio('ui_click'); self.setSlot(si); });
          self.slotCards.push({ root: c, sel: sel, badge: badge, name: nm, lv: lv });
        })(i);
      }
      KBUI.text(this, W / 2, slotY + 44, 'Pick a slot, then pick a fighter', 12, 600, '#9FB0CA');

      /* the nine fighters */
      var top = slotY + 68;
      var cols = 3;
      var cw = Math.min(116, (W - 32) / cols);
      var chH = Math.min(96, (H - top - ins.bottom - 20) / 3);
      KBArt.bakeCard(this, 'kb_fig', cw - 6, chH - 6, 12, 0x1A2440, 0.95, 0x6B85B5, 0.45);
      KBArt.bakeCard(this, 'kb_figlock', cw - 6, chH - 6, 12, 0x141B2E, 0.9, 0x3C4A66, 0.5);
      this.figCards = [];
      for (var f = 0; f < KB.FIGHTER_COUNT; f++) {
        (function (fid) {
          var def = KB.fighter(fid);
          var open = !!save.roster[fid];
          var col = fid % cols, row = (fid / cols) | 0;
          var x = W / 2 + (col - 1) * cw;
          var y = top + row * chH + chH / 2;
          var c = self.add.container(x, y);
          c.add(self.add.image(0, 0, open ? 'kb_fig' : 'kb_figlock'));
          var badge = self.add.image(0, -chH * 0.22, KBArt.badgeKey(fid));
          badge.setDisplaySize(38, 38);
          if (!open) badge.setAlpha(0.35);
          c.add(badge);
          var nm = KBUI.text(self, 0, chH * 0.08, open ? def.name : 'Locked', 11.5, 750,
            open ? '#F7FBFF' : '#7C8CA8');
          nm.setWordWrapWidth(cw - 14);
          c.add(nm);
          if (open) {
            var lv = KBUI.text(self, 0, chH * 0.28, 'Lv ' + KB.level(save.xp[fid]) + '   ' + KB.KI[def.type].short,
              11, 700, KBArt.hex(KB.KI[def.type].face));
            c.add(lv);
            var xb = KBUI.bar(self, c, -(cw - 30) / 2, chH * 0.42, cw - 30, 5, KB.KI[def.type].face);
            xb.set(KB.levelProgress(save.xp[fid]));
          } else {
            var need = KBUI.text(self, 0, chH * 0.3, 'Stage ' + (def.unlock + 1), 11, 700, '#7C8CA8');
            c.add(need);
          }
          c.setSize(cw - 6, chH - 6);
          c.setInteractive(new Phaser.Geom.Rectangle(-(cw - 6) / 2, -(chH - 6) / 2, cw - 6, chH - 6),
            Phaser.Geom.Rectangle.Contains);
          c.on('pointerup', function () {
            G.unlock();
            if (!open) { G.audio('invalid'); self.info(def, false); return; }
            G.audio('ui_click');
            G.setTeamSlot(self.slot, fid);
            self.refreshSlots();
            self.info(def, true);
          });
          self.figCards.push({ root: c, fid: fid });
        })(f);
      }

      var infoY = top + 3 * chH + 34;
      var infoW = Math.min(W - 24, 360);
      KBArt.bakeCard(this, 'kb_info_' + Math.round(infoW), infoW, 74, 14, 0x18213A, 0.94, 0x6B85B5, 0.45);
      this.add.image(W / 2, infoY, 'kb_info_' + Math.round(infoW));
      this.infoText = KBUI.text(this, W / 2, infoY, '', 12.5, 650, '#C9D4E4');
      this.infoText.setWordWrapWidth(infoW - 24);
      KBUI.text(this, W / 2, infoY + 58,
        'Fighters level up from every stage you clear.', 12, 600, '#9FB0CA');
      this.info(KB.fighter(save.team[0]), true);

      this.onResize = function () { if (self.scene.isActive()) self.scene.restart(); };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize); });
    },
    setSlot: function (i) {
      this.slot = i;
      for (var k = 0; k < this.slotCards.length; k++) this.slotCards[k].sel.setVisible(k === i);
    },
    refreshSlots: function () {
      for (var i = 0; i < 3; i++) {
        var id = save.team[i];
        var card = this.slotCards[i];
        card.badge.setTexture(KBArt.badgeKey(id));
        card.badge.setDisplaySize(38, 38);
        KBUI.setText(card.name, KB.fighter(id).name.split(' ')[0]);
        KBUI.setText(card.lv, 'Lv ' + KB.level(save.xp[id]));
      }
    },
    info: function (def, open) {
      if (!open) {
        KBUI.setText(this.infoText, def.name + ' joins after stage ' + (def.unlock + 1) + '.');
        return;
      }
      KBUI.setText(this.infoText, def.trait + '   Burst: ' + def.special.name + '. ' + def.special.text);
    },
    update: function (time, delta) {
      if (kit.paused) return;
      if (this.bg) this.bg.update(Math.min(delta, 50) / 1000);
    }
  });

  /* ------------------------------------------------------------- TRIALS */
  var TrialScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function TrialScene() { Phaser.Scene.call(this, { key: 'trials' }); },
    create: function () {
      var self = this;
      prepareCamera(this);
      G.verify.scene = 'trials'; G.verify.mode = 'trials'; G.verify.over = true;
      var W = this.scale.width / DPR, H = this.scale.height / DPR, ins = KBUI.insets();
      this.bg = KBUI.backdrop(this, KB.arc(3), -20);
      G.music('theme_core');

      KBUI.text(this, W / 2, ins.top + 26, 'Trial Gauntlet', 20, 800, '#F7FBFF');
      KBUI.text(this, W / 2, ins.top + 50, 'Fixed teams. Fixed rules.', 12.5, 600, '#9FB0CA');
      KBUI.button(this, {
        x: ins.left + 32, y: ins.top + 26, icon: 'back', size: 44,
        onPress: function () { G.audio('ui_click'); self.scene.start('menu'); }
      });

      var toast = KBUI.transients(this, this.add.container(0, 0).setDepth(30), {
        isLive: function () { return false; },
        reduced: function () { return !kit.juice.enabled; }
      });

      var top = ins.top + 76;
      var rowH = Math.min(84, (H - top - ins.bottom - 16) / KB.TRIAL_COUNT);
      var cardW = Math.min(W - 24, 360);
      KBArt.bakeCard(this, 'kb_trial_' + Math.round(cardW) + '_' + Math.round(rowH),
        cardW, rowH - 8, 14, 0x1C2A46, 0.94, 0x6B85B5, 0.5);

      for (var i = 0; i < KB.TRIAL_COUNT; i++) {
        (function (ti) {
          var t = KB.trial(ti);
          var open = KB.trialOpen(save, ti);
          var done = !!save.trials[ti];
          var y = top + rowH * ti + rowH / 2;
          var row = self.add.container(W / 2, y);
          var bg = self.add.image(0, 0, 'kb_trial_' + Math.round(cardW) + '_' + Math.round(rowH));
          bg.setAlpha(open ? 1 : 0.55);
          row.add(bg);
          var ic = self.add.image(-cardW / 2 + 26, 0, open ? (done ? 'kb_ic_medal' : 'kb_ic_trial') : 'kb_ic_lock');
          ic.setDisplaySize(22, 22).setTint(done ? 0xF7C948 : (open ? 0xA8F0BB : 0x7C8CA8));
          row.add(ic);
          var nm = KBUI.text(self, -cardW / 2 + 48, -14, t.name, 15, 750, open ? '#F7FBFF' : '#9FB0CA');
          nm.setOrigin(0, 0.5); row.add(nm);
          var info = open ? t.rule : ('Clear ' + t.need + ' stages to open this trial');
          var bl = KBUI.text(self, -cardW / 2 + 48, 10, info, 11.5, 600, '#9FB0CA');
          bl.setOrigin(0, 0.5); bl.setWordWrapWidth(cardW - 90); row.add(bl);
          /* the fixed team, as badges */
          for (var k = 0; k < t.team.length; k++) {
            var b = self.add.image(cardW / 2 - 26 - (2 - k) * 22, -14, KBArt.badgeKey(t.team[k]));
            b.setDisplaySize(20, 20);
            if (!open) b.setAlpha(0.4);
            row.add(b);
          }
          row.setSize(cardW, rowH - 8);
          row.setInteractive(new Phaser.Geom.Rectangle(-cardW / 2, -(rowH - 8) / 2, cardW, rowH - 8),
            Phaser.Geom.Rectangle.Contains);
          row.on('pointerup', function () {
            G.unlock();
            if (open) { G.audio('ui_click'); self.scene.start('play', { mode: 'trial', trial: ti }); }
            else toast.chip('Locked until ' + t.need + ' stages', {
              icon: 'lock', tint: 0xF7C948, x: W / 2, y: top - 16, hold: 900
            });
          });
        })(i);
      }

      this.onResize = function () { if (self.scene.isActive()) self.scene.restart(); };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize); });
    },
    update: function (time, delta) {
      if (kit.paused) return;
      if (this.bg) this.bg.update(Math.min(delta, 50) / 1000);
    }
  });

  /* ------------------------------------------------------------- RESULT */
  var ResultScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function ResultScene() { Phaser.Scene.call(this, { key: 'result' }); },
    init: function (data) { this.data2 = data || {}; },
    create: function () {
      var self = this, d = this.data2;
      prepareCamera(this);
      G.verify.scene = 'result'; G.verify.mode = d.mode || 'road'; G.verify.over = true;
      var W = this.scale.width / DPR, H = this.scale.height / DPR, ins = KBUI.insets();
      var arcIdx = d.mode === 'road' ? ((KB.clamp(d.stage | 0, 0, 29) / 6) | 0) : 3;
      this.bg = KBUI.backdrop(this, KB.arc(arcIdx), -20);
      this.fxLayer = this.add.container(0, 0).setDepth(-5);
      this.fx = KBFx.create(this, this.fxLayer, kit);
      G.music(d.won ? 'theme_road' : 'theme_core');
      if (d.won) {
        this.fx.confetti(W / 2, H * 0.24, W * 0.7, 0xF7C948);
        this.fx.ring(W / 2, H * 0.30, 0xFFFFFF, 3.2, 0.7);
      }

      var title = d.won ? 'Stage clear' : 'Team down';
      if (d.mode === 'endless') title = 'Surge over';
      if (d.mode === 'trial' && d.won) title = 'Trial clear';
      KBUI.text(this, W / 2, H * 0.2, title, 28, 800, d.won ? '#A8F0BB' : '#FF9AA4');

      var lines = [];
      if (d.mode === 'endless') {
        lines.push('Score ' + d.score + '   best ' + save.endBest);
        lines.push('Surges survived ' + d.wave);
      } else {
        lines.push('Turns ' + d.turns + '   damage ' + d.damage);
      }
      var reward = d.reward || { xp: 0, levels: [], unlocked: [], crown: false };
      if (reward.xp) lines.push('Team experience +' + reward.xp);
      for (var l = 0; l < reward.levels.length; l++) {
        lines.push(KB.fighter(reward.levels[l].id).name + ' reached level ' + reward.levels[l].to);
      }
      for (var u = 0; u < reward.unlocked.length; u++) {
        lines.push(KB.fighter(reward.unlocked[u]).name + ' joined the roster');
      }
      for (var i = 0; i < lines.length && i < 6; i++) {
        KBUI.text(this, W / 2, H * 0.29 + i * 24, lines[i], 14, 650, '#DCE6F5');
      }
      if (reward.unlocked.length) {
        G.audio('unlock');
        var badge = this.add.image(W / 2, H * 0.29 + Math.min(lines.length, 6) * 24 + 40,
          KBArt.badgeKey(reward.unlocked[0]));
        badge.setDisplaySize(64, 64);
        this.fx.ring(badge.x, badge.y, 0xF7C948, 3, 0.7);
      }

      var y = Math.max(H * 0.56, H * 0.29 + Math.min(lines.length, 6) * 24 + (reward.unlocked.length ? 110 : 46));
      var bw = Math.min(288, W - 56);
      var next = KB.nextStage(save);
      if (d.mode === 'road' && d.won && next > d.stage) {
        KBUI.pill(this, {
          x: W / 2, y: y, w: bw, h: 54, fill: 0x38A8DE, icon: 'play', label: 'Stage ' + (next + 1),
          onPress: function () { G.audio('ui_click'); self.scene.start('play', { mode: 'road', stage: next }); }
        });
      } else {
        KBUI.pill(this, {
          x: W / 2, y: y, w: bw, h: 54, fill: 0x38A8DE, icon: 'restart', label: 'Try again',
          onPress: function () {
            G.audio('ui_click');
            self.scene.start('play', { mode: d.mode, stage: d.stage, trial: d.trial });
          }
        });
      }
      KBUI.pill(this, {
        x: W / 2, y: y + 64, w: bw, h: 50, fill: 0x2E4269, color: '#F7FBFF',
        icon: 'map', iconTint: 0xF7FBFF, label: d.mode === 'trial' ? 'Trial list' : 'Burst Road',
        onPress: function () {
          G.audio('ui_click');
          self.scene.start(d.mode === 'trial' ? 'trials' : 'map', { focus: next });
        }
      });
      KBUI.pill(this, {
        x: W / 2, y: y + 122, w: bw, h: 50, fill: 0x1C2A46, color: '#F7FBFF',
        icon: 'roster', iconTint: 0xF7FBFF, label: 'Roster',
        onPress: function () { G.audio('ui_click'); self.scene.start('roster'); }
      });

      if (reward.crown) {
        this.time.delayedCall(900, function () { self.scene.start('crown'); });
      }
      G.markTutorialDone();

      this.onResize = function () { if (self.scene.isActive()) self.scene.restart(d); };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize); });
    },
    update: function (time, delta) {
      if (kit.paused) return;
      var dt = Math.min(delta, 50) / 1000;
      if (this.bg) this.bg.update(dt);
      if (this.fx) this.fx.update(dt);
    }
  });

  /* -------------------------------------------------------------- CROWN */
  var CrownScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function CrownScene() { Phaser.Scene.call(this, { key: 'crown' }); },
    create: function () {
      var self = this;
      prepareCamera(this);
      G.verify.scene = 'crown'; G.verify.mode = 'crown'; G.verify.over = true;
      var W = this.scale.width / DPR, H = this.scale.height / DPR, ins = KBUI.insets();
      this.bg = KBUI.backdrop(this, KB.arc(4), -20);
      this.fxLayer = this.add.container(0, 0).setDepth(-5);
      this.fx = KBFx.create(this, this.fxLayer, kit);
      G.music('theme_core');
      G.audio('victory');

      var crown = this.add.image(W / 2, H * 0.26, 'kb_ic_crown');
      crown.setDisplaySize(92, 92).setTint(0xF7C948);
      if (kit.juice.enabled) {
        this.tweens.add({
          targets: crown, scaleX: crown.scaleX * 1.06, scaleY: crown.scaleY * 1.06,
          duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      }
      KBUI.text(this, W / 2, H * 0.26 + 78, 'THE BURST CORE', 26, 800, '#F7FBFF');
      KBUI.text(this, W / 2, H * 0.26 + 108, 'All thirty stages cleared.', 15, 650, '#C9D4E4');
      KBUI.text(this, W / 2, H * 0.26 + 136,
        KB.rosterCount(save) + ' of ' + KB.FIGHTER_COUNT + ' fighters   best surge ' + save.endBest,
        13, 650, '#9FB0CA');

      this.fx.confetti(W / 2, H * 0.22, W * 0.7, 0xF7C948);
      this.time.addEvent({
        delay: 950, loop: true,
        callback: function () { self.fx.confetti(W / 2, H * 0.2, W * 0.7, 0x9A7CF3); }
      });

      var y = H * 0.62, bw = Math.min(288, W - 56);
      KBUI.pill(this, {
        x: W / 2, y: y, w: bw, h: 54, fill: 0x9A7CF3, icon: 'trial', label: 'Trial Gauntlet',
        onPress: function () { G.audio('ui_click'); self.scene.start('trials'); }
      });
      KBUI.pill(this, {
        x: W / 2, y: y + 64, w: bw, h: 50, fill: 0x2E4269, color: '#F7FBFF',
        icon: 'infinity', iconTint: 0xF7FBFF, label: 'Endless Surge',
        onPress: function () { G.audio('ui_click'); self.scene.start('play', { mode: 'endless' }); }
      });
      KBUI.pill(this, {
        x: W / 2, y: y + 122, w: bw, h: 50, fill: 0x1C2A46, color: '#F7FBFF',
        icon: 'map', iconTint: 0xF7FBFF, label: 'Burst Road',
        onPress: function () { G.audio('ui_click'); self.scene.start('map', { focus: KB.STAGE_COUNT - 1 }); }
      });
      KBUI.text(this, W / 2, H - ins.bottom - 24, 'Nothing here was ever for sale.', 12, 600, '#7C8CA8');

      this.onResize = function () { if (self.scene.isActive()) self.scene.restart(); };
      this.scale.on('resize', this.onResize);
      this.events.once('shutdown', function () { self.scale.off('resize', self.onResize); });
    },
    update: function (time, delta) {
      if (kit.paused) return;
      var dt = Math.min(delta, 50) / 1000;
      if (this.bg) this.bg.update(dt);
      if (this.fx) this.fx.update(dt);
    }
  });

  /* --------------------------------------------------------------- game */
  function start() {
    var view = cssViewport();
    var cfg = GGKit.hiDpi.phaser({
      type: Phaser.AUTO,
      parent: document.body,          /* never null: null skips DOM mounting */
      backgroundColor: '#141B2E',
      scale: { mode: Phaser.Scale.NONE, width: view.width, height: view.height },
      render: Object.assign({}, GGKit.renderDefaults, { batchSize: 2048 }),
      fps: { target: 60, min: 30 },
      scene: [BootScene, MenuScene, MapScene, RosterScene, TrialScene, PlayScene, ResultScene, CrownScene]
    });
    DPR = cfg.ggDpr;
    root.__KB_DPR = DPR;
    G.phaser = new Phaser.Game(cfg);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
