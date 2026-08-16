/* Aegis Line - game.js
 * Boot, title and command screens, plus the Phaser configuration.
 *
 * Load order: al_data, al_art, al_core, al_play, al_paint, then this file.
 * Everything shared lives on window.AL (al_core.js); the play scene config is
 * window.ALPlay, assembled from al_play.js and al_paint.js.
 *
 * Phaser input is switched off in the game config on purpose. All pointer and
 * key handling goes through GGKit plus the window-level tap queue installed in
 * al_core.js after GGKit.create, which is the only ordering in which a touch
 * claim survives.
 */
(function (root) {
  'use strict';

  var AL = root.AL, D = root.ALData, ART = root.ALArt;
  var clamp = AL.clamp;
  var kit = AL.kit;
  var DPR = 1;

  function densityCamera(scene, w, h) {
    scene.cameras.main.setZoom(DPR);
    scene.cameras.main.centerOn(w / 2, h / 2);
  }

  var SFX = ['sfx_shot', 'sfx_shot_heavy', 'sfx_hit', 'sfx_crit', 'sfx_kill',
    'sfx_boss_kill', 'sfx_reload', 'sfx_perfect', 'sfx_burst', 'sfx_hurt',
    'sfx_shield', 'sfx_alarm', 'sfx_ui', 'sfx_confirm', 'sfx_unlock',
    'sfx_clear', 'sfx_fail', 'sfx_advance'];
  var MUSIC = ['music_command', 'music_field', 'music_siege'];

  var Game = { phaser: null };

  // Dress GGKit's loader so the first screen already belongs to this game.
  function themeLoader() {
    var box = document.body.lastElementChild;
    if (!box || box.tagName !== 'DIV') return;
    box.style.background =
      'radial-gradient(120% 90% at 50% 12%, #2a1220 0%, #140a12 46%, #07060a 100%)';
    var h = box.firstElementChild;
    if (h) {
      h.style.letterSpacing = '6px';
      h.style.color = '#ffd07a';
      h.style.fontSize = '22px';
      h.style.fontFamily = AL.FONT;
    }
    var track = h && h.nextElementSibling;
    if (track) {
      track.style.background = 'rgba(24,14,12,0.9)';
      track.style.border = '1px solid rgba(255,176,102,0.35)';
      var bar = track.firstElementChild;
      if (bar) {
        bar.style.background = 'linear-gradient(90deg,#c0432c,#ffd07a)';
        bar.style.boxShadow = '0 0 14px rgba(255,176,102,0.75)';
      }
    }
  }

  // ================================================================= boot
  // The whole art payload is generated here, one task per frame, so the
  // loading bar reports real progress instead of jumping from 0 to 1 and the
  // browser never blocks for the length of the entire bake.
  var BootScene = {
    key: 'boot',

    create: function () {
      var scene = this;
      densityCamera(this, this.scale.width / DPR, this.scale.height / DPR);
      kit.loader.show('AEGIS LINE');
      themeLoader();
      AL.refreshCanvasOffset(this.game.canvas);

      this.tasks = [];
      this.tasks.push(function () {
        ART.buildAtlas(scene, D.SQUAD, D.ENEMY_KEYS, D.BOSS_KEYS);
      });
      this.tasks.push(function () { ART.buildLogo(scene); });
      for (var c = 0; c < D.CHAPTERS.length; c++) {
        (function (ch) {
          scene.tasks.push(function () { ART.buildChapter(scene, ch); });
        })(D.CHAPTERS[c]);
      }
      this.tasks.push(function () { scene.prewarm(); });
      this.tasks.push(function () { scene.startAudio(); });
      this.taskCount = this.tasks.length;
      this.done = 0;
      this.audioDone = false;
      this.audioProgress = 0;
      this.finished = false;
    },

    // Touch every frame once through the renderer so the first gameplay frame
    // never pays a texture upload mid-volley.
    prewarm: function () {
      var warm = this.add.container(0, 0).setAlpha(0.001);
      var tex = this.textures.get('atlas');
      var names = tex.getFrameNames();
      for (var i = 0; i < names.length; i++) warm.add(this.add.image(4, 4, 'atlas', names[i]));
      for (var c = 0; c < D.CHAPTERS.length; c++) {
        var k = D.CHAPTERS[c].key;
        warm.add(this.add.image(4, 4, 'sky_' + k));
        warm.add(this.add.image(4, 4, 'glow_' + k));
        warm.add(this.add.image(4, 4, 'far_' + k));
        warm.add(this.add.image(4, 4, 'mid_' + k));
        warm.add(this.add.image(4, 4, 'near_' + k));
        warm.add(this.add.image(4, 4, 'cover_' + k));
      }
      warm.add(this.add.image(4, 4, 'logo'));
      warm.add(this.add.image(4, 4, 'px'));
      warm.add(this.add.image(4, 4, 'vig'));
      this.warm = warm;
    },

    startAudio: function () {
      var scene = this;
      var reg = {};
      for (var i = 0; i < SFX.length; i++) reg[SFX[i]] = 'assets/' + SFX[i] + '.mp3';
      for (var m = 0; m < MUSIC.length; m++) reg[MUSIC[m]] = 'assets/' + MUSIC[m] + '.mp3';
      kit.audio.register(reg);
      var done = 0;
      Promise.all(SFX.map(function (n) {
        return kit.audio.preload([n]).then(function () {
          done++;
          scene.audioProgress = done / SFX.length;
        });
      })).then(function () {
        scene.audioProgress = 1;
        scene.audioDone = true;
        // Music decodes in the background while the title screen is already
        // up. Nothing awaits it, so it never delays the boot, and no 330 KB
        // decode ever lands in the middle of a fight.
        kit.audio.preload(MUSIC);
      });
    },

    update: function () {
      if (this.finished) return;
      if (this.tasks.length) {
        var task = this.tasks.shift();
        task();
        this.done++;
        kit.loader.progress(0.08 + 0.72 * (this.done / this.taskCount));
        return;
      }
      kit.loader.progress(0.80 + 0.20 * this.audioProgress);
      if (!this.audioDone) return;
      this.finished = true;
      if (this.warm) { this.warm.destroy(true); this.warm = null; }
      kit.loader.progress(1);
      var scene = this;
      this.time.delayedCall(60, function () {
        kit.loader.hide();
        scene.scene.start(AL.route());
      });
    }
  };

  // Where the boot lands, honouring any force switch set before the game ran.
  AL.route = function () {
    var s = AL.state;
    if (s.forceMode === 'campaign' || s.forceMode === 'tower' || s.forceMode === 'daily') {
      var mode = s.forceMode;
      s.forceMode = '';
      AL.pendingPlay = {
        mode: mode,
        index: mode === 'tower' ? Math.max(0, (s.forceFloor || 1) - 1) : Math.max(0, (s.forceStage || 1) - 1)
      };
      return 'play';
    }
    if (s.forceMode === 'command') { s.forceMode = ''; return 'command'; }
    s.forceMode = '';
    return 'title';
  };

  // Shared force polling for the two menu scenes.
  function pollMenuForce(scene) {
    var s = AL.state;
    if (s.forceUnlockAll) {
      s.forceUnlockAll = false;
      AL.save.cleared = D.STAGES.length;
      AL.save.towerBest = D.TOWER.length;
      AL.save.credits = clamp(AL.save.credits + 50000, 0, 9999999);
      AL.save.cores = clamp(AL.save.cores + 400, 0, 99999);
      AL.normalise(AL.save);
      AL.persist();
      if (scene.rebuild) scene.rebuild();
    }
    if (!s.forceMode) return;
    var m = s.forceMode;
    s.forceMode = '';
    if (m === 'campaign' || m === 'tower' || m === 'daily') {
      scene.scene.start('play', {
        mode: m,
        index: m === 'tower' ? Math.max(0, (s.forceFloor || 1) - 1) : Math.max(0, (s.forceStage || 1) - 1)
      });
    } else if (m === 'command' && scene.scene.key !== 'command') {
      scene.scene.start('command');
    } else if (m === 'title' && scene.scene.key !== 'title') {
      scene.scene.start('title');
    }
  }

  function menuChapterKey() {
    var idx = clamp(D.chapterOfStage(Math.max(1, AL.save.cleared || 1)), 0, D.CHAPTERS.length - 1);
    return D.CHAPTERS[idx].key;
  }

  // ================================================================ title
  var TitleScene = {
    key: 'title',

    create: function () {
      var scene = this;
      densityCamera(this, this.scale.width / DPR, this.scale.height / DPR);
      AL.uiInit(this);
      AL.state.mode = 'title';
      AL.state.phase = 'title';
      AL.state.ready = true;
      AL.syncMeta(AL.save);
      AL.onPause = null; AL.onResume = null; AL.onRestart = null;
      AL.onRawKey = function (code) {
        if (code === 'Enter' || code === 'Space') scene.scene.start('command');
      };

      this.bd = AL.makeBackdrop(this, menuChapterKey());
      this.logo = this.add.image(0, 0, 'logo').setOrigin(0.5).setDepth(120);
      this.tag = AL.txt(this, 0, 0, 'HOLD THE COVER LINE', 14, AL.CSS.dim, '700')
        .setOrigin(0.5).setDepth(120);
      this.best = AL.txt(this, 0, 0, '', 14, AL.CSS.dim).setOrigin(0.5).setDepth(120);

      this.btnPlay = this.addBtn({
        x: 0, y: 0, w: 250, h: 54, label: 'DEPLOY', icon: 'ic_play', plate: true,
        tone: 'go', size: 19, depth: 130,
        onTap: function () { scene.scene.start('command'); }
      });
      this.btnSet = this.addBtn({
        x: 0, y: 0, w: 250, h: 46, label: 'SETTINGS', icon: 'ic_gear', plate: true, depth: 130,
        onTap: function () { kit.openSettings(); }
      });

      this.layout();
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () {
        scene.scale.off('resize', scene.layout, scene);
        AL.onRawKey = null;
      });
      kit.audio.music('music_command', 900);
      AL.clearTaps();
    },

    layout: function () {
      var w = this.scale.width / DPR, h = this.scale.height / DPR;
      densityCamera(this, w, h);
      AL.refreshCanvasOffset(this.game.canvas);
      var ins = AL.insets;
      // ground plane runs off the bottom of the screen: leaving the sky
      // gradient exposed below it reads as a stray bright band
      this.bd.layout(w, h, h * 0.22, h + 24);
      var logoScale = Math.min(1, (w * 0.62) / 560);
      this.logo.setPosition(w * 0.5, h * 0.30).setScale(logoScale);
      this.tag.setPosition(w * 0.5, h * 0.30 + 96 * logoScale);
      this.btnPlay.x = w * 0.5; this.btnPlay.y = h * 0.62; this.btnPlay.layout();
      this.btnSet.x = w * 0.5; this.btnSet.y = h * 0.62 + 62; this.btnSet.layout();
      this.best.setPosition(w * 0.5, h - ins.bottom - 18);
    },

    update: function (time, delta) {
      var dt = Math.min(delta, 60) / 1000;
      this.bd.tick(dt, 0);
      var taps = AL.taps;
      while (taps.length) this.routeTap(taps.shift());
      this.paintBtns(dt);
      var s = AL.save;
      AL.setTxt(this.best, 'CAMPAIGN ' + s.cleared + '/' + D.STAGES.length +
        '    TOWER ' + s.towerBest + '/' + D.TOWER.length +
        '    BEST ' + AL.fmt(s.bestScore || 0));
      pollMenuForce(this);
    }
  };

  // ============================================================== command
  // Four tabs behind one screen: campaign, tower, daily and the squad. Tab
  // contents are rebuilt on switch, never per frame.
  var CommandScene = {
    key: 'command',

    create: function () {
      var scene = this;
      densityCamera(this, this.scale.width / DPR, this.scale.height / DPR);
      AL.uiInit(this);
      AL.state.mode = 'command';
      AL.state.phase = 'command';
      AL.syncMeta(AL.save);
      AL.onPause = null; AL.onResume = null; AL.onRestart = null;
      AL.onRawKey = function (code) {
        if (code === 'Escape') scene.scene.start('title');
      };

      this.tab = 'campaign';
      this.chapterSel = clamp(D.chapterOfStage(Math.max(1, AL.save.cleared || 1)), 0, D.CHAPTERS.length - 1);
      this.stageSel = clamp(AL.save.cleared, 0, D.STAGES.length - 1);
      this.floorSel = clamp(AL.save.towerBest, 0, D.TOWER.length - 1);
      this.unitSel = AL.save.lead;

      this.bd = AL.makeBackdrop(this, menuChapterKey());
      this.dim = this.add.image(0, 0, 'px').setOrigin(0, 0)
        .setDepth(10).setTint(0x04070d).setAlpha(0.55);
      // Nine slice, not a stretched image: blowing a 128x64 rounded plate up
      // to full panel size smears its corner radius and its border into a
      // gradient down the edges.
      this.panel = this.add.nineslice(0, 0, 'atlas', 'plate', 128, 64, 22, 22, 22, 22)
        .setOrigin(0, 0).setDepth(20).setAlpha(0.9);

      this.title = AL.txt(this, 0, 0, 'COMMAND', 20, AL.CSS.gold, '700').setOrigin(0, 0.5).setDepth(30);
      this.icCredit = this.add.image(0, 0, 'atlas', 'ic_credit').setOrigin(0.5)
        .setDepth(30).setDisplaySize(16, 16).setTint(AL.PAL.gold);
      this.creditTxt = AL.txt(this, 0, 0, '0', 15, AL.CSS.text, '700').setOrigin(0, 0.5).setDepth(30);
      this.icCore = this.add.image(0, 0, 'atlas', 'ic_core').setOrigin(0.5)
        .setDepth(30).setDisplaySize(16, 16).setTint(AL.PAL.cyan);
      this.coreTxt = AL.txt(this, 0, 0, '0', 15, AL.CSS.text, '700').setOrigin(0, 0.5).setDepth(30);

      this.head = AL.txt(this, 0, 0, '', 19, AL.CSS.text, '700').setOrigin(0, 0.5).setDepth(30);
      this.sub = AL.txt(this, 0, 0, '', 14, AL.CSS.dim).setOrigin(0, 0.5).setDepth(30);
      this.body = [];
      for (var i = 0; i < 6; i++) {
        this.body.push(AL.txt(this, 0, 0, '', 14, AL.CSS.dim).setOrigin(0, 0.5).setDepth(30).setVisible(false));
      }
      this.portrait = this.add.image(0, 0, 'atlas', 'por_venn').setOrigin(0.5)
        .setDepth(30).setVisible(false);
      this.toast = AL.makeToast(this, 120);

      this.layout();
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () {
        scene.scale.off('resize', scene.layout, scene);
        AL.onRawKey = null;
      });
      kit.audio.music('music_command', 700);
      AL.clearTaps();
      this.rebuild();
    },

    layout: function () {
      var w = this.scale.width / DPR, h = this.scale.height / DPR;
      densityCamera(this, w, h);
      AL.refreshCanvasOffset(this.game.canvas);
      var ins = AL.insets;
      this.W = w; this.H = h; this.ins = ins;
      this.bd.layout(w, h, h * 0.22, h + 24);
      this.dim.setDisplaySize(w, h);
      this.topY = ins.top + 26;
      this.panelX = ins.left + 138;
      this.panelY = ins.top + 52;
      this.panelW = w - this.panelX - ins.right - 12;
      this.panelH = h - this.panelY - ins.bottom - 12;
      this.panel.setPosition(this.panelX, this.panelY).setSize(this.panelW, this.panelH);
      this.title.setPosition(ins.left + 14, this.topY);
      var rx = w - ins.right - 14;
      this.coreTxt.setPosition(rx - 44, this.topY);
      this.icCore.setPosition(rx - 60, this.topY);
      this.creditTxt.setPosition(rx - 150, this.topY);
      this.icCredit.setPosition(rx - 166, this.topY);
      this.head.setPosition(this.panelX + 18, this.panelY + 26);
      this.sub.setPosition(this.panelX + 18, this.panelY + 48);
      for (var i = 0; i < this.body.length; i++) {
        this.body[i].setPosition(this.panelX + 18, this.panelY + 76 + i * 21);
      }
      this.portrait.setPosition(this.panelX + this.panelW - 66, this.panelY + 70).setDisplaySize(88, 88);
      this.toast.anchor.x = w - ins.right - 12;
      this.toast.anchor.y = ins.top + 26;
      if (this.rebuild) this.rebuild();
    },

    setTab: function (t) {
      this.tab = t;
      this.rebuild();
    },

    rebuild: function () {
      if (!this.panelW) return;
      var scene = this;
      this.clearBtns();
      for (var b = 0; b < this.body.length; b++) AL.setVis(this.body[b], false);
      AL.setVis(this.portrait, false);

      var ins = this.ins, h = this.H;
      // tab rail, left edge, 44 px tall targets
      var tabs = [
        ['campaign', 'CAMPAIGN', 'ic_flag'],
        ['tower', 'TOWER', 'ic_tower'],
        ['daily', 'DAILY', 'ic_daily'],
        ['squad', 'SQUAD', 'ic_burst']
      ];
      var ty = this.panelY + 24;
      for (var t = 0; t < tabs.length; t++) {
        (function (row) {
          scene.addBtn({
            x: ins.left + 68, y: ty, w: 118, h: 44, label: row[1], icon: row[2],
            iconSize: 17, size: 13, depth: 40, selected: scene.tab === row[0],
            onTap: function () { scene.setTab(row[0]); }
          });
        })(tabs[t]);
        ty += 50;
      }
      this.addBtn({
        x: ins.left + 68, y: h - ins.bottom - 32, w: 118, h: 44, label: 'TITLE', depth: 40,
        onTap: function () { scene.scene.start('title'); }
      });

      if (this.tab === 'campaign') this.buildCampaign();
      else if (this.tab === 'tower') this.buildTower();
      else if (this.tab === 'daily') this.buildDaily();
      else this.buildSquad();
    },

    setBody: function (lines) {
      for (var i = 0; i < this.body.length; i++) {
        var on = i < lines.length;
        AL.setVis(this.body[i], on);
        if (on) AL.setTxt(this.body[i], lines[i]);
      }
    },

    // ---------------------------------------------------------- campaign
    buildCampaign: function () {
      var scene = this;
      var save = AL.save;
      var px = this.panelX, py = this.panelY, pw = this.panelW;
      AL.setTxt(this.head, D.CHAPTERS[this.chapterSel].name);
      AL.setTxt(this.sub, D.CHAPTERS[this.chapterSel].sub);

      // chapter chips
      var cw = Math.min(74, (pw - 40) / 5 - 6);
      var cx0 = px + 18 + cw / 2;
      for (var c = 0; c < D.CHAPTERS.length; c++) {
        (function (ci) {
          var open = ci === 0 || save.cleared >= ci * 6;
          scene.addBtn({
            x: cx0 + ci * (cw + 6), y: py + 84, w: cw, h: 44,
            label: 'CH ' + (ci + 1), size: 13, depth: 40,
            selected: scene.chapterSel === ci, enabled: open,
            icon: open ? null : 'ic_lock', iconSize: 14,
            onTap: function () { scene.chapterSel = ci; scene.rebuild(); }
          });
        })(c);
      }

      // six stages of the selected chapter, two rows of three
      var bw = Math.min(212, (pw - 48) / 3 - 8);
      var bx0 = px + 18 + bw / 2;
      var by0 = py + 146;
      for (var s = 0; s < 6; s++) {
        (function (si) {
          var idx = scene.chapterSel * 6 + si;
          var st = D.STAGES[idx];
          if (!st) return;
          var open = idx <= save.cleared;
          var stars = save.stars[String(idx)] || 0;
          var mark = st.kind === 'boss' ? 'ic_skull' : (st.kind === 'elite' ? 'ic_star' : null);
          scene.addBtn({
            x: bx0 + (si % 3) * (bw + 8), y: by0 + Math.floor(si / 3) * 56,
            w: bw, h: 48, size: 13,
            label: (scene.chapterSel + 1) + '-' + (si + 1) + '  ' + st.name,
            sub: open ? (stars ? new Array(stars + 1).join('*') + '   ' + st.sub : st.sub) : 'Locked',
            icon: open ? mark : 'ic_lock', iconSize: 15, align: 'left', depth: 40,
            enabled: open, selected: scene.stageSel === idx,
            onTap: function () { scene.stageSel = idx; scene.rebuild(); }
          });
        })(s);
      }

      var sel = D.STAGES[this.stageSel] || D.STAGES[0];
      var plan = AL.planFor('campaign', this.stageSel);
      this.setBody([]);
      AL.setTxt(this.sub, plan.name + '   ' + sel.sub);
      this.addBtn({
        x: px + pw - 90, y: py + this.panelH - 36, w: 152, h: 48,
        label: 'DEPLOY', icon: 'ic_play', tone: 'go', size: 16, plate: true, depth: 40,
        enabled: this.stageSel <= save.cleared,
        onTap: function () {
          scene.scene.start('play', { mode: 'campaign', index: scene.stageSel });
        }
      });
    },

    // ------------------------------------------------------------- tower
    buildTower: function () {
      var scene = this;
      var save = AL.save;
      var px = this.panelX, py = this.panelY, pw = this.panelW;
      var maxOpen = Math.min(D.TOWER.length - 1, save.towerBest);
      this.floorSel = clamp(this.floorSel, 0, maxOpen);
      var f = D.TOWER[this.floorSel];
      var mod = D.MOD_BY_KEY[f.mod] || D.MODIFIERS[0];
      var ch = D.CHAPTERS[clamp(f.ch, 0, D.CHAPTERS.length - 1)];

      AL.setTxt(this.head, 'AEGIS TOWER   FLOOR ' + f.floor);
      AL.setTxt(this.sub, 'Highest floor held: ' + save.towerBest + ' of ' + D.TOWER.length);
      this.setBody([
        'Setting: ' + ch.name,
        'Modifier: ' + mod.name + '   ' + mod.line,
        'Waves: ' + f.waves + (f.kind === 'boss' ? '   Boss floor' : (f.kind === 'elite' ? '   Elite floor' : '')),
        'Reward: ' + f.credits + ' credits, ' + f.cores + ' cores',
        'Every floor is harder than the last and there is no retreat bonus.'
      ]);

      this.addBtn({
        x: px + 60, y: py + this.panelH - 36, w: 60, h: 48, label: '<', size: 20, depth: 40,
        enabled: this.floorSel > 0,
        onTap: function () { scene.floorSel--; scene.rebuild(); }
      });
      this.addBtn({
        x: px + 128, y: py + this.panelH - 36, w: 60, h: 48, label: '>', size: 20, depth: 40,
        enabled: this.floorSel < maxOpen,
        onTap: function () { scene.floorSel++; scene.rebuild(); }
      });
      this.addBtn({
        x: px + pw - 90, y: py + this.panelH - 36, w: 152, h: 48,
        label: 'CLIMB', icon: 'ic_tower', tone: 'go', size: 16, plate: true, depth: 40,
        onTap: function () {
          scene.scene.start('play', { mode: 'tower', index: scene.floorSel });
        }
      });
    },

    // ------------------------------------------------------------- daily
    buildDaily: function () {
      var scene = this;
      var px = this.panelX, py = this.panelY, pw = this.panelW;
      var stamp = D.todayStamp();
      var dp = D.dailyPlan(stamp);
      var ch = D.CHAPTERS[clamp(dp.ch, 0, D.CHAPTERS.length - 1)];
      var m1 = D.MOD_BY_KEY[dp.mods[0]] || D.MODIFIERS[0];
      var m2 = D.MOD_BY_KEY[dp.mods[1]] || D.MODIFIERS[0];
      var best = (AL.save.daily.date === stamp) ? AL.save.daily.best : 0;

      AL.setTxt(this.head, 'DAILY SIMULATION');
      AL.setTxt(this.sub, stamp + '   seed ' + (dp.seed % 100000));
      this.setBody([
        'Setting: ' + ch.name,
        'Modifier: ' + m1.name + '   ' + m1.line,
        'Modifier: ' + m2.name + '   ' + m2.line,
        'Waves: ' + dp.waves + '   Threat tier ' + dp.tier.toFixed(1),
        'Today best: ' + AL.fmt(best) + '   Runs today: ' + (AL.save.daily.date === stamp ? AL.save.daily.runs : 0),
        'The seed rolls over at midnight on your device.'
      ]);
      this.addBtn({
        x: px + pw - 90, y: py + this.panelH - 36, w: 152, h: 48,
        label: 'RUN', icon: 'ic_daily', tone: 'go', size: 16, plate: true, depth: 40,
        onTap: function () { scene.scene.start('play', { mode: 'daily', index: 0 }); }
      });
    },

    // -------------------------------------------------------------- squad
    buildSquad: function () {
      var scene = this;
      var save = AL.save;
      var px = this.panelX, py = this.panelY, pw = this.panelW, ph = this.panelH;
      var unlocked = D.unlockedIdsFor(save.cleared);

      AL.setTxt(this.head, 'SQUAD');
      AL.setTxt(this.sub, 'Deployed ' + save.team.length + ' of 5   Tap a name to inspect');

      var lw = Math.min(132, pw * 0.34);
      var lx = px + 18 + lw / 2;
      for (var i = 0; i < D.SQUAD.length; i++) {
        (function (u) {
          var open = unlocked.indexOf(u.id) !== -1;
          var rec = save.units[u.id] || { lv: 1, gear: 0 };
          var onTeam = save.team.indexOf(u.id) !== -1;
          scene.addBtn({
            x: lx + (Math.floor(scene.__i2(u) / 4)) * (lw + 8),
            y: py + 74 + (scene.__i2(u) % 4) * 46,
            w: lw, h: 42, size: 13, align: 'left', depth: 40,
            label: open ? u.name + '  Lv' + rec.lv : 'LOCKED',
            sub: open ? (u.weapon + '   ' + (onTeam ? 'DEPLOYED' : 'reserve')) : ('Clears stage ' + u.unlock),
            icon: open ? (onTeam ? 'ic_check' : null) : 'ic_lock', iconSize: 14,
            enabled: open, selected: scene.unitSel === u.id,
            onTap: function () { scene.unitSel = u.id; scene.rebuild(); }
          });
        })(D.SQUAD[i]);
      }

      var u2 = D.SQUAD_BY_ID[this.unitSel] || D.SQUAD[0];
      if (unlocked.indexOf(u2.id) === -1) u2 = D.SQUAD_BY_ID[unlocked[0]] || D.SQUAD[0];
      this.unitSel = u2.id;
      var st = AL.unitStats(u2.id);
      var rec2 = save.units[u2.id];
      // detail column starts clear of BOTH roster columns, not at a
      // fraction of the panel that happens to land inside the second one
      var dx = px + 18 + 2 * (lw + 8) + 20;

      AL.setVis(this.portrait, true);
      if (this.portrait.frame.name !== 'por_' + u2.id) this.portrait.setFrame('por_' + u2.id);
      this.portrait.setPosition(px + pw - 56, py + 58).setDisplaySize(72, 72);

      var gearNext = D.GEAR_TIERS[rec2.gear + 1] || null;
      var lvCost = rec2.lv < D.MAX_LEVEL ? D.levelCost(rec2.lv) : 0;
      for (var b = 0; b < this.body.length; b++) AL.setVis(this.body[b], false);
      var lines = [
        u2.name + '  ' + u2.call + '   ' + D.WEAPONS[u2.weapon].name,
        'Level ' + rec2.lv + '   Gear ' + st.gear.name + '   Power ' + st.power,
        'Damage ' + st.damage.toFixed(0) + '   Rate ' + st.rpm.toFixed(0) + '/min   Crit x' + st.crit.toFixed(2),
        'Burst: ' + u2.burst.name,
        u2.burst.line,
        'Passive: ' + u2.passive.line
      ];
      for (var l = 0; l < lines.length; l++) {
        var t = this.body[l];
        AL.setVis(t, true);
        AL.setTxt(t, lines[l]);
        t.setPosition(dx, py + 76 + l * 21);
      }

      var byy = py + ph - 36;
      this.addBtn({
        x: dx + 78, y: byy - 52, w: 168, h: 44, size: 13, depth: 40,
        label: rec2.lv < D.MAX_LEVEL ? 'LEVEL UP  ' + AL.fmt(lvCost) : 'LEVEL MAX',
        icon: 'ic_up', iconSize: 15,
        enabled: rec2.lv < D.MAX_LEVEL && save.credits >= lvCost,
        onTap: function () {
          if (save.credits < lvCost || rec2.lv >= D.MAX_LEVEL) return;
          save.credits -= lvCost;
          rec2.lv++;
          AL.persist();
          kit.audio.sfx('sfx_unlock', { volume: 0.7 });
          scene.toast.push('LEVEL ' + rec2.lv, 'ic_up', AL.PAL.green);
          scene.rebuild();
        }
      });
      this.addBtn({
        x: dx + 258, y: byy - 52, w: 168, h: 44, size: 13, depth: 40,
        label: gearNext ? 'GEAR ' + gearNext.name : 'GEAR MAX',
        sub: gearNext ? (gearNext.credits + 'c  ' + gearNext.cores + ' cores') : '',
        icon: 'ic_gear', iconSize: 15,
        enabled: !!gearNext && save.credits >= (gearNext ? gearNext.credits : 0) &&
          save.cores >= (gearNext ? gearNext.cores : 0),
        onTap: function () {
          if (!gearNext) return;
          if (save.credits < gearNext.credits || save.cores < gearNext.cores) return;
          save.credits -= gearNext.credits;
          save.cores -= gearNext.cores;
          rec2.gear++;
          AL.persist();
          kit.audio.sfx('sfx_unlock', { volume: 0.8 });
          scene.toast.push(gearNext.name, 'ic_gear', AL.PAL.cyan);
          scene.rebuild();
        }
      });
      var onTeam2 = save.team.indexOf(u2.id) !== -1;
      this.addBtn({
        x: dx + 78, y: byy, w: 168, h: 44, size: 13, depth: 40,
        label: onTeam2 ? 'STAND DOWN' : 'DEPLOY UNIT',
        icon: onTeam2 ? 'ic_check' : 'ic_flag', iconSize: 15,
        enabled: onTeam2 ? save.team.length > 1 : save.team.length < 5,
        onTap: function () {
          var at = save.team.indexOf(u2.id);
          if (at !== -1) { if (save.team.length > 1) save.team.splice(at, 1); }
          else if (save.team.length < 5) save.team.push(u2.id);
          AL.normalise(save);
          AL.persist();
          kit.audio.sfx('sfx_confirm', { volume: 0.6 });
          scene.rebuild();
        }
      });
      this.addBtn({
        x: dx + 258, y: byy, w: 168, h: 44, size: 13, depth: 40,
        label: 'TAKE POINT', icon: 'ic_star', iconSize: 15,
        enabled: onTeam2 && save.lead !== u2.id,
        onTap: function () {
          save.lead = u2.id;
          AL.persist();
          kit.audio.sfx('sfx_confirm', { volume: 0.6 });
          scene.rebuild();
        }
      });
    },

    __i2: function (u) {
      for (var i = 0; i < D.SQUAD.length; i++) if (D.SQUAD[i].id === u.id) return i;
      return 0;
    },

    update: function (time, delta) {
      var dt = Math.min(delta, 60) / 1000;
      this.bd.tick(dt, 0);
      var taps = AL.taps;
      while (taps.length) this.routeTap(taps.shift());
      this.paintBtns(dt);
      this.toast.tick(dt);
      AL.setTxt(this.creditTxt, AL.fmt(AL.save.credits));
      AL.setTxt(this.coreTxt, AL.fmt(AL.save.cores));
      AL.syncMeta(AL.save);
      pollMenuForce(this);
    }
  };

  // Give the play scene its entry data when a force switch chose it at boot.
  var PlayScene = root.ALPlay;
  var origCreate = PlayScene.create;
  PlayScene.create = function (data) {
    densityCamera(this, this.scale.width / DPR, this.scale.height / DPR);
    if ((!data || data.mode == null) && AL.pendingPlay) {
      data = AL.pendingPlay;
      AL.pendingPlay = null;
    }
    origCreate.call(this, data || { mode: 'campaign', index: 0 });
  };

  // =============================================================== boot up
  // Phaser wires only preload, create and update from a plain config object,
  // so every scene literal is promoted to a real Scene subclass with its full
  // method set on the prototype.
  function toScene(cfg) {
    var Klass = function () { Phaser.Scene.call(this, { key: cfg.key }); };
    Klass.prototype = Object.create(Phaser.Scene.prototype);
    Klass.prototype.constructor = Klass;
    for (var k in cfg) {
      if (k === 'key') continue;
      Klass.prototype[k] = cfg[k];
    }
    return Klass;
  }

  var cssW = Math.max(1, Math.floor(document.documentElement.clientWidth || 1280));
  var cssH = Math.max(1, Math.floor(document.documentElement.clientHeight || 720));
  var config = {
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: '#07060a',
    scale: {
      mode: Phaser.Scale.NONE,
      width: cssW,
      height: cssH
    },
    // Phaser must not install canvas-level pointer or key listeners: GGKit
    // owns both, and a canvas listener firing first is what kills touch.
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    render: Object.assign({}, GGKit.renderDefaults, { batchSize: 4096 }),
    fps: { target: 60, min: 30 },
    scene: [toScene(BootScene), toScene(TitleScene), toScene(CommandScene), toScene(PlayScene)]
  };
  config = GGKit.hiDpi.phaser(config);
  DPR = config.ggDpr;
  root.__GG_AEGIS_DPR = DPR;
  Game.phaser = new Phaser.Game(config);
  function syncHiDpi(game) {
    var nextW = Math.max(1, Math.floor(document.documentElement.clientWidth || 1));
    var nextH = Math.max(1, Math.floor(document.documentElement.clientHeight || 1));
    if (!game || !game.scale) return;
    var apply = function () {
      try {
        game.scale.resize(Math.round(nextW * DPR), Math.round(nextH * DPR));
        if (game.canvas) {
          game.canvas.style.width = nextW + 'px';
          game.canvas.style.height = nextH + 'px';
        }
      } catch (e) { /* a resize must never take the title down */ }
    };
    if (game.isBooted) apply();
    else if (game.events && game.events.once) game.events.once('ready', apply);
  }
  syncHiDpi(Game.phaser);
  root.addEventListener('resize', function () { syncHiDpi(Game.phaser); });
  root.addEventListener('orientationchange', function () { syncHiDpi(Game.phaser); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) syncHiDpi(Game.phaser);
  });

  kit.registerPWA();
  AL.game = Game;
  root.__AEGIS_READY = true;
})(typeof window !== 'undefined' ? window : globalThis);
