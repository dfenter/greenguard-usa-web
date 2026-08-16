/* Hivefall - the play scene: board, lane track, horde, HUD, coaching.
 *
 * The scene is a pure view over HFSim. It drains sim events once per frame,
 * reads pooled sim slots by index, and keeps every piece of render state in
 * its own parallel arrays; no view state is ever written onto a sim entity.
 */
var HFPlayScene = new Phaser.Class({
  Extends: Phaser.Scene,

  initialize: function HFPlayScene() { Phaser.Scene.call(this, { key: 'play' }); },

  /* ------------------------------------------------------------- init -- */
  init: function (data) {
    var G = window.HFGame;
    this.mode = (data && data.mode) === 'endless' ? 'endless' : 'fall';
    this.waveNum = HF.clamp((data && data.wave) | 0 || G.save.wave, 1, HF.WAVES);
    if (this.mode === 'endless') this.waveNum = 1;
    this.G = G;
    this.kit = G.kit;
  },

  create: function () {
    var self = this;
    var G = this.G;

    this.L = {};
    this.acc = 0;
    this.over = 0;
    this.overT = 0;
    this.sfxAt = {};
    this.shakeSeed = 0;

    /* --------------------------------------------------------- layers -- */
    this.world = this.add.container(0, 0);
    this.trackLayer = this.add.container(0, 0);
    this.mobLayer = this.add.container(0, 0);
    this.boardLayer = this.add.container(0, 0);
    this.fxLayer = this.add.container(0, 0);
    this.world.add(this.trackLayer);
    this.world.add(this.mobLayer);
    this.world.add(this.boardLayer);
    this.world.add(this.fxLayer);
    this.hudLayer = this.add.container(0, 0).setDepth(50);
    this.overlay = this.add.container(0, 0).setDepth(90);

    /* ------------------------------------------------------------ sim -- */
    var stats = HF.stats(G.save.up);
    this.sim = HFSim.create({
      cols: 6, rows: 6,
      colors: HF.colorsFor(G.save.best),
      wave: this.waveNum,
      endless: this.mode === 'endless',
      stats: stats
    });
    this.stats = stats;
    this.act = this.sim.act;
    this.threat = [];

    /* ------------------------------------------------- track and board -- */
    this.trackImg = this.add.image(0, 0, 'hf_px').setOrigin(0, 0);
    this.trackLayer.add(this.trackImg);
    this.vig = this.add.image(0, 0, 'hf_vig').setOrigin(0, 0).setAlpha(0.55);
    this.trackLayer.add(this.vig);

    this.laneWash = [];
    this.laneChev = [];
    var i, r, c;
    for (i = 0; i < 6; i++) {
      var wash = this.add.image(0, 0, 'hf_lanewash').setOrigin(0.5, 1).setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.trackLayer.add(wash);
      this.laneWash.push(wash);
      var chev = this.add.image(0, 0, 'hf_chev').setOrigin(0.5, 0).setAlpha(0);
      this.trackLayer.add(chev);
      this.laneChev.push(chev);
    }

    this.frameImg = this.add.image(0, 0, 'hf_px').setOrigin(0, 0);
    this.boardLayer.add(this.frameImg);

    /* one persistent sprite per cell, plus its hazard coat and view state */
    this.cells = [];
    this.hazards = [];
    this.cellView = [];
    for (r = 0; r < 6; r++) {
      var rowS = [], rowH = [], rowV = [];
      for (c = 0; c < 6; c++) {
        var img = this.add.image(0, 0, 'hf_p_cannon');
        this.boardLayer.add(img);
        rowS.push(img);
        var hz = this.add.image(0, 0, 'hf_haz_bramble_1').setVisible(false);
        this.boardLayer.add(hz);
        rowH.push(hz);
        rowV.push({ key: '', hazKey: '', settle: 0, prevOy: 0, spin: 0 });
      }
      this.cells.push(rowS);
      this.hazards.push(rowH);
      this.cellView.push(rowV);
    }

    /* selector: Ready / Preview / Resolve / Invalid */
    this.selFocus = this.add.image(0, 0, 'hf_focus').setVisible(false);
    this.selGhost = this.add.image(0, 0, 'hf_ghost').setVisible(false);
    this.selArrow = this.add.image(0, 0, 'hf_arrow').setVisible(false);
    this.selCross = this.add.image(0, 0, 'hf_cross').setVisible(false);
    this.selPop = this.add.image(0, 0, 'hf_pop').setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.boardLayer.add(this.selFocus);
    this.boardLayer.add(this.selGhost);
    this.boardLayer.add(this.selArrow);
    this.boardLayer.add(this.selCross);
    this.boardLayer.add(this.selPop);
    this.sel = { state: 'ready', r: 5, c: 0, t: 0, keyMode: false, dragR: -1, dragC: -1, tr: -1, tc: -1 };

    /* ------------------------------------------------------ mob pools -- */
    this.mobView = [];
    for (i = 0; i < this.sim.enemies.length; i++) {
      var m = this.add.image(0, 0, 'hf_m_mite').setVisible(false);
      var bg = this.add.image(0, 0, 'hf_px').setVisible(false).setOrigin(0, 0.5).setTint(0x0B0F14);
      var fl = this.add.image(0, 0, 'hf_px').setVisible(false).setOrigin(0, 0.5).setTint(0xF25C68);
      this.mobLayer.add(m); this.mobLayer.add(bg); this.mobLayer.add(fl);
      this.mobView.push({ img: m, bg: bg, fill: fl, key: '', flash: 0, born: -1 });
    }
    this.shotView = [];
    for (i = 0; i < this.sim.shots.length; i++) {
      var s = this.add.image(0, 0, 'hf_s_shell').setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
      this.mobLayer.add(s);
      this.shotView.push({ img: s, key: '' });
    }

    /* --------------------------------------------------------- effects -- */
    this.fx = HFFx.create(this, this.fxLayer, this.kit);
    this.flashImg = this.add.image(0, 0, 'hf_flash').setOrigin(0, 0).setAlpha(0).setDepth(80);
    this.flash = 0;
    this.flashTint = 0xFFFFFF;

    /* ------------------------------------------------------------ HUD -- */
    this.buildHud();

    /* ---------------------------------------------------------- input -- */
    this.bindInput();

    this.scale.on('resize', this.relayout, this);
    this.events.once('shutdown', function () {
      self.scale.off('resize', self.relayout, self);
      if (self.pauseCard) self.closePause(true);
    });

    this.relayout();
    this.startWave(true);
    G.music(this.musicFor());
  },

  musicFor: function () {
    if (this.mode === 'endless') return this.sim.wave % 2 === 0 ? 'theme_siege' : 'theme_watch';
    return (this.sim.script.boss || this.sim.wave % 10 >= 8) ? 'theme_siege' : 'theme_watch';
  },

  /* ------------------------------------------------------------- HUD --- */
  buildHud: function () {
    var self = this;
    var G = this.G;

    this.hudBg = this.add.image(0, 0, 'hf_flash').setOrigin(0, 0).setTint(0x0D131E).setAlpha(0.92);
    this.hudLayer.add(this.hudBg);

    this.actText = HFUI.text(this, 0, 0, '', 14, '#9FB3C8', 700);
    this.waveText = HFUI.text(this, 0, 0, '', 17, '#F2F7FF', 800);
    this.hudLayer.add(this.actText);
    this.hudLayer.add(this.waveText);

    this.salvIcon = this.add.image(0, 0, 'hf_ic_gear').setDisplaySize(17, 17).setTint(0xF7C948);
    this.salvText = HFUI.text(this, 0, 0, '0', 16, '#F7C948', 800).setOrigin(1, 0.5);
    this.hudLayer.add(this.salvIcon);
    this.hudLayer.add(this.salvText);

    this.wallBar = HFUI.Bar(this, this.hudLayer, 0, 0, 100, 12);
    this.wallIcon = this.add.image(0, 0, 'hf_ic_wall').setDisplaySize(15, 15).setTint(0x7B95B4);
    this.hudLayer.add(this.wallIcon);

    /* wave progress: how much of the horde script is spent */
    this.waveBar = HFUI.Bar(this, this.hudLayer, 0, 0, 100, 6);
    this.waveBar.set(0, 0x8FA4BB);

    this.flareBtn = HFUI.Button(this, {
      x: 0, y: 0, w: 46, h: 46, label: '', icon: 'flare', iconSize: 22, kind: 'main',
      container: this.hudLayer, onTap: function () { self.doFlare(); }
    });
    this.flareCount = HFUI.text(this, 0, 0, '1', 12, '#FFD98A', 800).setOrigin(0.5, 0.5);
    this.hudLayer.add(this.flareCount);

    this.pauseBtn = HFUI.Button(this, {
      x: 0, y: 0, w: 46, h: 46, label: '=', fs: 20, kind: 'ghost',
      container: this.hudLayer, onTap: function () { self.openPause(); }
    });

    this.chips = HFUI.Chips(this, this.hudLayer, 0, 0);
    this.strip = HFUI.Strip(this, this.hudLayer, 390, 0);
    this.banner = HFUI.Banner(this, this.overlay, 390, 844);

    /* boss meter, only present while a named horror is on the track */
    this.bossName = HFUI.text(this, 0, 0, '', 14, '#FFD98A', 800).setOrigin(0.5, 0.5).setVisible(false);
    this.hudLayer.add(this.bossName);
    this.bossBar = HFUI.Bar(this, this.hudLayer, 0, 0, 100, 9);
    this.bossBar.setVisible(false);
  },

  /* ---------------------------------------------------------- layout --- */
  relayout: function () {
    var dpr = window.__HF_DPR || GGKit.hiDpi.dpr();
    var W = this.scale.width / dpr, H = this.scale.height / dpr;
    if (!W || !H) return;
    var ins = HFUI.insets(true);
    var L = this.L;
    L.W = W; L.H = H; L.ins = ins;

    L.hudH = Math.round(ins.top + 74);
    L.pad = 10;
    var margin = 8;
    var maxCellW = (W - margin * 2 - L.pad * 2 - 12) / 6;
    var maxCellH = (H * 0.455 - L.pad * 2 - 12) / 6;
    L.cell = Math.max(34, Math.floor(Math.min(maxCellW, maxCellH)));
    L.boardW = L.cell * 6 + 12 + L.pad * 2;
    L.boardH = L.cell * 6 + 12 + L.pad * 2;
    L.boardX = Math.round((W - L.boardW) / 2);
    L.boardY = Math.round(H - ins.bottom - 8 - L.boardH);
    L.cellX0 = L.boardX + L.pad + 6;
    L.cellY0 = L.boardY + L.pad + 6;

    L.trackX = 0; L.trackW = W;
    L.trackY = L.hudH;
    L.trackH = Math.max(120, L.boardY - 6 - L.hudH);
    L.wallH = 26;
    L.laneW = L.cell;
    L.laneX0 = L.cellX0;
    L.runLen = L.trackH - L.wallH;
    this.sim.setTrack(L.runLen);

    /* baked chrome, one texture per act and size */
    var fk = HFArt.bakeFrame(this, this.act, L.boardW, L.boardH, L.cell, 6, 6, L.pad);
    this.frameImg.setTexture(fk).setPosition(L.boardX, L.boardY);
    this.frameImg.setDisplaySize(L.boardW, L.boardH);
    var tk = HFArt.bakeTrack(this, this.act, W, L.trackH, 6, L.laneX0, L.laneW, L.wallH);
    this.trackImg.setTexture(tk).setPosition(0, L.trackY);
    this.trackImg.setDisplaySize(W, L.trackH);
    this.vig.setPosition(0, L.trackY).setDisplaySize(W, L.trackH);

    var i;
    for (i = 0; i < 6; i++) {
      var lx = L.laneX0 + (i + 0.5) * L.laneW;
      this.laneWash[i].setPosition(lx, L.trackY + L.trackH - L.wallH);
      this.laneWash[i].setDisplaySize(L.laneW - 2, Math.min(180, L.runLen * 0.5));
      this.laneChev[i].setPosition(lx, L.trackY + 12).setDisplaySize(26, 17);
    }

    /* HUD placement, safe-area aware, icons over labels */
    var top = ins.top;
    var padX = 12 + ins.left;
    var padR = W - 12 - ins.right;
    this.hudBg.setPosition(0, 0).setDisplaySize(W, L.hudH);
    this.actText.setPosition(padX, top + 9);
    this.waveText.setPosition(padX, top + 27);

    this.pauseBtn.layout(padR - 25, top + 26);
    this.flareBtn.layout(padR - 25 - 52, top + 26);
    this.flareCount.setPosition(padR - 25 - 52 + 16, top + 39);

    /* row two: the wall meter reads as a bar and an icon, no repeated label.
     * The salvage counter keeps a fixed reserve so a growing number can never
     * ride over the meter. */
    this.salvText.setPosition(padR, top + 58);
    this.salvIcon.setPosition(padR - 74, top + 58);
    var barRight = padR - 92;
    this.wallIcon.setPosition(padX + 7, top + 58);
    this.wallBar.setGeom(padX + 18, top + 58, Math.max(60, barRight - padX - 18), 13);
    this.waveBar.setGeom(padX, L.hudH - 4, W - padX * 2, 4);

    this.chips.setPos(padR, L.hudH + 22);
    this.strip.resize(W, L.hudH + 24);
    this.banner.resize(W, H);
    this.bossName.setPosition(W / 2, L.hudH + 16);
    this.bossBar.setGeom(W * 0.5 - Math.min(150, W * 0.36), L.hudH + 32, Math.min(300, W * 0.72), 9);

    this.flashImg.setDisplaySize(W, H);
    if (this.pauseCard) this.layoutPause();
    this.syncBoard(0, true);
  },

  /* ----------------------------------------------------------- input --- */
  bindInput: function () {
    var self = this;
    this.input.addPointer(2);

    this.input.on('pointerdown', function (p) {
      if (self.kit.paused || self.over) return;
      var cell = self.cellAt(p.x, p.y);
      if (!cell) return;
      self.sel.dragR = cell.r; self.sel.dragC = cell.c;
      self.sel.dragX = p.x; self.sel.dragY = p.y;
      self.sel.dragId = p.id;
      self.sel.keyMode = false;
      self.sel.r = cell.r; self.sel.c = cell.c;
      self.sel.state = 'ready';
      self.sel.tr = -1; self.sel.tc = -1;
    });

    this.input.on('pointermove', function (p) {
      if (self.kit.paused || self.over) return;
      if (self.sel.dragR < 0 || p.id !== self.sel.dragId) return;
      var dx = p.x - self.sel.dragX, dy = p.y - self.sel.dragY;
      var th = Math.max(10, self.L.cell * 0.22);
      if (Math.abs(dx) < th && Math.abs(dy) < th) { self.sel.tr = -1; self.sel.tc = -1; return; }
      var tr = self.sel.dragR, tc = self.sel.dragC;
      if (Math.abs(dx) > Math.abs(dy)) tc += dx > 0 ? 1 : -1; else tr += dy > 0 ? 1 : -1;
      if (tr < 0 || tc < 0 || tr > 5 || tc > 5) { self.sel.tr = -1; self.sel.tc = -1; return; }
      self.sel.tr = tr; self.sel.tc = tc;
      var legal = self.sim.matchable(self.sel.dragR, self.sel.dragC) && self.sim.matchable(tr, tc);
      self.sel.state = legal ? 'preview' : 'invalid';
      if (Math.abs(dx) > self.L.cell * 0.42 || Math.abs(dy) > self.L.cell * 0.42) {
        self.commitSwap(self.sel.dragR, self.sel.dragC, tr, tc);
      }
    });

    function release(p) {
      if (self.sel.dragR < 0) return;
      if (self.sel.tr >= 0) self.commitSwap(self.sel.dragR, self.sel.dragC, self.sel.tr, self.sel.tc);
      self.sel.dragR = -1; self.sel.dragC = -1; self.sel.tr = -1; self.sel.tc = -1;
      if (self.sel.state === 'preview' || self.sel.state === 'invalid') self.sel.state = 'ready';
    }
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.input.on('gameout', release);

    /* keyboard, fully wired beside touch */
    this.input.keyboard.on('keydown', function (e) {
      if (self.kit.paused) {
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') self.closePause();
        return;
      }
      var k = e.key;
      var dr = 0, dc = 0;
      if (k === 'ArrowLeft' || k === 'a') dc = -1;
      else if (k === 'ArrowRight' || k === 'd') dc = 1;
      else if (k === 'ArrowUp' || k === 'w') dr = -1;
      else if (k === 'ArrowDown' || k === 's') dr = 1;
      if (dr || dc) {
        e.preventDefault();
        self.sel.keyMode = true;
        if (self.sel.picked) {
          self.commitSwap(self.sel.r, self.sel.c, self.sel.r + dr, self.sel.c + dc);
          self.sel.r = HF.clamp(self.sel.r + dr, 0, 5);
          self.sel.c = HF.clamp(self.sel.c + dc, 0, 5);
          self.sel.picked = false;
        } else {
          self.sel.r = HF.clamp(self.sel.r + dr, 0, 5);
          self.sel.c = HF.clamp(self.sel.c + dc, 0, 5);
        }
        return;
      }
      if (k === ' ' || k === 'Enter') {
        e.preventDefault();
        self.sel.keyMode = true;
        self.sel.picked = !self.sel.picked;
        self.sel.state = self.sel.picked ? 'preview' : 'ready';
        return;
      }
      if (k === 'f' || k === 'F') { self.doFlare(); return; }
      if (k === 'm' || k === 'M') { self.G.toggleMute(); return; }
      if (k === 'Escape' || k === 'p' || k === 'P') { self.openPause(); return; }
    });
  },

  cellAt: function (x, y) {
    var L = this.L;
    var c = Math.floor((x - L.cellX0) / L.cell);
    var r = Math.floor((y - L.cellY0) / L.cell);
    if (r < 0 || c < 0 || r > 5 || c > 5) return null;
    return { r: r, c: c };
  },

  commitSwap: function (r, c, r2, c2) {
    if (r2 < 0 || c2 < 0 || r2 > 5 || c2 > 5) return;
    var ok = this.sim.trySwap(r, c, r2, c2);
    this.sel.dragR = -1; this.sel.dragC = -1; this.sel.tr = -1; this.sel.tc = -1;
    if (ok) {
      this.sel.state = 'resolve';
      this.sel.t = 0;
      this.sel.r = r2; this.sel.c = c2;
      if (this.tut === 0) this.advanceTutorial(1);
    }
  },

  doFlare: function () {
    if (this.over || this.kit.paused) return;
    if (this.sim.useFlare()) return;
    this.G.audio('invalid');
    this.chips.push('flare', 'none left', 0x8FA4BB);
  },

  /* ---------------------------------------------------------- waves ---- */
  startWave: function (first) {
    var G = this.G, sim = this.sim;
    this.act = sim.act;
    this.over = 0; this.overT = 0;
    this.threat = [];
    this.relayoutActChrome();
    this.fx.clear();
    this.chips.clear();

    var title, sub;
    if (this.mode === 'endless') {
      title = 'Night ' + sim.wave;
      sub = this.act.name;
    } else if (sim.script.boss) {
      title = sim.script.boss.name;
      sub = 'Wave ' + sim.wave + ' of ' + HF.WAVES;
    } else {
      title = 'Wave ' + sim.wave;
      sub = this.act.name + (sim.script.elite ? ' - elites' : '');
    }
    this.banner.show(title, sub, sim.script.boss ? 1.9 : 1.15,
      sim.script.boss ? '#F25C68' : '#FFD98A');

    /* interactive first-run tutorial, three gated steps on wave 1 */
    this.tut = -1;
    if (first && this.mode === 'fall' && sim.wave === 1 && G.save.tut < 2) {
      this.tut = 0;
      sim.hold = true;
      this.strip.show('Drag a piece next to two of its kind', 9);
    } else if (first && G.prefs.hints) {
      this.strip.show(this.act.brief, 3.6);
    }
    this.refreshVerify();
  },

  relayoutActChrome: function () {
    var L = this.L;
    if (!L.W) return;
    var fk = HFArt.bakeFrame(this, this.act, L.boardW, L.boardH, L.cell, 6, 6, L.pad);
    this.frameImg.setTexture(fk).setDisplaySize(L.boardW, L.boardH);
    var tk = HFArt.bakeTrack(this, this.act, L.W, L.trackH, 6, L.laneX0, L.laneW, L.wallH);
    this.trackImg.setTexture(tk).setDisplaySize(L.W, L.trackH);
  },

  advanceTutorial: function (step) {
    var G = this.G;
    if (this.tut < 0 || step <= this.tut) return;
    this.tut = step;
    if (step === 1) {
      this.strip.show('Each match fires that survivor up the same column', 3.4);
    } else if (step === 2) {
      this.sim.hold = false;
      this.strip.show('Hold the wall. Green patches it, gold pays the shelter', 3.8);
    } else if (step === 3) {
      this.strip.show('Tap the flare to stun the lane when it gets close', 3.4);
    }
    if (step >= (G.save.tut | 0)) { G.save.tut = step; G.persist(); }
    if (step === 1) {
      var self = this;
      this.time.delayedCall(1400, function () { if (self.scene.isActive()) self.advanceTutorial(2); });
    }
  },

  /* ---------------------------------------------------------- update --- */
  update: function (time, delta) {
    var dt = HF.clamp(delta / 1000, 0, 0.1);
    var jf = this.kit.juice.frame();

    /* a cosmetic hold must freeze the sim, never let a clock run past it */
    if (!jf.frozen) {
      if (!this.over) this.sim.step(dt);
      else this.sim.step(Math.min(dt, 0.033));
      this.drainEvents();
    }

    this.fx.update(dt);
    this.syncBoard(dt, false);
    this.syncMobs(dt);
    this.syncShots();
    this.syncTelegraph(dt);
    this.syncHud(dt);
    this.chips.update(dt);
    this.strip.update(dt);
    this.banner.update(dt, !this.kit.juice.enabled);

    /* one shake source: GGKit juice offset plus the pooled frame nudge */
    var ox = jf.dx + this.fx.nudge.x;
    var oy = jf.dy + this.fx.nudge.y;
    this.world.setPosition(ox, oy);

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3.4);
      this.flashImg.setTint(this.flashTint).setAlpha(this.kit.juice.enabled ? this.flash * 0.5 : this.flash * 0.18);
    } else if (this.flashImg.alpha !== 0) {
      this.flashImg.setAlpha(0);
    }

    if (this.over) {
      this.overT += dt;
      if (this.overT > (this.over > 0 ? 1.35 : 1.7)) {
        var res = this.over;
        this.over = 0;
        this.finish(res);
      }
    }
    this.refreshVerify();
  },

  sfx: function (name, opts, minGap) {
    var now = this.time.now;
    var last = this.sfxAt[name] || -1e9;
    if (now - last < (minGap == null ? 45 : minGap)) return;
    this.sfxAt[name] = now;
    this.G.audio(name, opts);
  },

  /* -------------------------------------------------------- sim events - */
  drainEvents: function () {
    var self = this;
    var L = this.L, G = this.G;
    this.sim.drain(function (ev) {
      var x, y, i;
      switch (ev.type) {
        case 'swap':
          self.sfx('swap');
          break;
        case 'invalid':
          self.sfx('invalid');
          self.sel.state = 'invalid';
          self.sel.t = 0;
          self.sel.r = ev.a; self.sel.c = ev.b;
          break;
        case 'blocked':
          self.sfx('invalid');
          self.chips.push('vent', 'coated tile', 0x8FA4BB);
          break;
        case 'match':
          self.onMatch(ev.a, ev.b);
          break;
        case 'shot':
          x = L.laneX0 + (ev.a + 0.5) * L.laneW;
          y = L.trackY + L.trackH - L.wallH;
          self.fx.muzzle(x, y, ev.b === 'coil' ? 0x7FD8FF : (ev.b === 'venom' ? 0xC48AFF : 0xFFB35C));
          self.sfx('shot', { volume: 0.45, rate: 0.94 + Math.random() * 0.12 }, 55);
          break;
        case 'hit':
          var e = self.sim.enemies[ev.a];
          self.fx.burst(self.mobX(e), self.mobY(e), ev.b === 'coil' ? 0x7FD8FF :
            (ev.b === 'venom' ? 0xC48AFF : 0xFFC98A), 3, 130, 0.7);
          self.sfx('impact', { volume: 0.4 }, 60);
          break;
        case 'chill':
          self.fx.sparkle(self.mobX(self.sim.enemies[ev.a]), self.mobY(self.sim.enemies[ev.a]), 0x7FD8FF, 5, false);
          break;
        case 'venom':
          self.fx.sparkle(self.mobX(self.sim.enemies[ev.a]), self.mobY(self.sim.enemies[ev.a]), 0xC48AFF, 5, false);
          break;
        case 'kill':
          self.onKill(ev);
          break;
        case 'heal':
          x = L.laneX0 + (ev.a + 0.5) * L.laneW;
          y = L.trackY + L.trackH - L.wallH - 6;
          if (ev.b > 0) {
            self.fx.pop(x, y - 8, '+' + ev.b, '#8CE8A4');
            self.fx.sparkle(x, y, 0x5BCB77, 6, true);
            self.sfx('repair', { volume: 0.5 }, 90);
          }
          break;
        case 'coin':
          x = L.laneX0 + (ev.a + 0.5) * L.laneW;
          self.fx.sparkle(x, L.trackY + L.trackH - L.wallH - 8, 0xF7C948, 5, true);
          self.chips.push('gear', '+' + ev.b, 0xF7C948);
          self.sfx('salvage', { volume: 0.45 }, 90);
          break;
        case 'breach':
          self.onBreach(ev);
          break;
        case 'absorb':
          self.chips.push('brick', 'absorbed', 0x7B95B4);
          self.sfx('impact', { volume: 0.5 }, 60);
          break;
        case 'spit':
          self.fx.sparkle(self.mobX(self.sim.enemies[ev.a]), self.mobY(self.sim.enemies[ev.a]), 0xA6D9B4, 6, false);
          break;
        case 'hazardNew':
          x = L.cellX0 + (ev.b + 0.5) * L.cell;
          y = L.cellY0 + (ev.a + 0.5) * L.cell;
          self.fx.sparkle(x, y, self.act.hazard.color, 6, false);
          self.chips.push('vent', self.act.hazard.name, self.act.hazard.color);
          break;
        case 'hazard':
          x = L.cellX0 + (ev.b + 0.5) * L.cell;
          y = L.cellY0 + (ev.a + 0.5) * L.cell;
          self.fx.burst(x, y, self.act.hazard.color, 5, 150, 0.8);
          break;
        case 'pity':
          self.chips.push('spark', 'charged', 0xFFD98A);
          break;
        case 'charged':
          self.fx.ringAt(L.boardX + L.boardW / 2, L.boardY + L.boardH / 2, 0xFFD98A, 3.4, 0.5);
          break;
        case 'reshuffle':
          self.strip.show('The board reset. No moves were left', 2.4);
          break;
        case 'flare':
          self.onFlare(ev);
          break;
        case 'bossIn':
          self.onBossIn(ev);
          break;
        case 'bossAct':
          var be = self.sim.enemies[ev.a];
          self.fx.ringAt(self.mobX(be), self.mobY(be), ev.b === 'healer' ? 0x5BCB77 :
            (ev.b === 'shield' ? 0x7FD8FF : 0xF25C68), 2.6, 0.55);
          self.sfx('flare', { volume: 0.35 }, 400);
          break;
        case 'cleared':
          self.over = 1;
          self.onCleared();
          break;
        case 'lost':
          self.over = -1;
          self.onLost();
          break;
      }
    });
  },

  onMatch: function (combo, cells) {
    var L = this.L, sim = this.sim;
    var r, c, i;
    var tierRing = false;
    /* burst every cell that entered the clear this step */
    for (r = 0; r < 6; r++) {
      for (c = 0; c < 6; c++) {
        var g = sim.grid[r][c];
        if (g.pop < 0 || g.pop > 0.02) continue;
        var sq = HF.SQUAD[HF.clamp(g.t, 0, HF.SQUAD.length - 1)];
        var x = L.cellX0 + (c + 0.5) * L.cell;
        var y = L.cellY0 + (r + 0.5) * L.cell;
        this.fx.burst(x, y, sq.color, 4, 170, 0.85);
        this.fx.trail(x, L.trackY + L.trackH - L.wallH + 10, sq.color, 1.6);
      }
    }
    if (combo <= 1) {
      this.sfx('match', { rate: 1 }, 40);
    } else {
      this.sfx('cascade', { rate: HF.clamp(0.92 + combo * 0.06, 0.9, 1.5), volume: 0.6 }, 40);
      this.chips.push('chevron', 'x' + combo, 0xFFD98A);
    }
    if (combo >= 2 && combo < 4) {
      this.fx.frameNudge(this.L.H * 0.006, 0.16);
    } else if (combo >= 4) {
      this.fx.frameNudge(this.L.H * 0.012, 0.2);
      this.fx.ringAt(L.boardX + L.boardW / 2, L.boardY + L.boardH / 2, 0xFFD98A, 3.2, 0.55);
      this.kit.juice.hitStop(60);
      this.sfx('clear', { volume: 0.5 }, 500);
      tierRing = true;
    }
    if (cells >= 6 && !tierRing) this.kit.juice.hitStop(40);
    this.sel.state = 'resolve';
    this.sel.t = 0;
  },

  onKill: function (ev) {
    var e = this.sim.enemies[ev.a];
    var L = this.L;
    var x = L.laneX0 + (ev.b + 0.5) * L.laneW;
    var y = L.trackY + ev.c * L.runLen;
    var boss = ev.d;
    var tint = boss ? 0xFFD98A : this.act.hordeTint;
    this.fx.burst(x, y, tint, boss ? 22 : 8, boss ? 300 : 200, boss ? 1.5 : 1);
    this.fx.puff(x, y, 0x2A3345, boss ? 5 : 2);
    if (boss) {
      this.fx.ringAt(x, y, 0xFFD98A, 5, 0.8);
      this.kit.juice.shake(7, 260);
      this.kit.juice.hitStop(90);
      this.sfx('boss', { volume: 0.9 }, 400);
      this.banner.show('Horror down', '', 1.1, '#FFD98A');
      this.flash = 0.7; this.flashTint = 0xFFE7B0;
    } else {
      this.sfx('kill', { volume: 0.5, rate: 0.92 + Math.random() * 0.18 }, 55);
    }
    if (this.mobView[ev.a]) this.mobView[ev.a].flash = 0;
  },

  onBreach: function (ev) {
    var L = this.L;
    var x = L.laneX0 + (ev.a + 0.5) * L.laneW;
    var y = L.trackY + L.trackH - L.wallH;
    this.fx.puff(x, y, 0x6A3038, 4);
    this.fx.burst(x, y, 0xF25C68, 10, 220, 1.1);
    this.fx.pop(x, y + 16, '-' + ev.b, '#FF9AA4');
    this.kit.juice.shake(5, 200);
    this.fx.frameNudge(L.H * 0.010, 0.2, Math.PI / 2);
    this.sfx('breach', { volume: 0.8 }, 120);
    this.flash = 0.55; this.flashTint = 0xF25C68;
    if (this.tut >= 0 && this.tut < 3) this.advanceTutorial(3);
  },

  onFlare: function (ev) {
    var L = this.L;
    this.flash = 0.9; this.flashTint = 0xFFF0C8;
    this.fx.ringAt(L.W / 2, L.trackY + L.trackH * 0.55, 0xFFD98A, 9, 0.75);
    this.sfx('flare', { volume: 0.8 }, 200);
    this.chips.push('flare', 'stunned ' + ev.a, 0xFFD98A);
    this.kit.juice.shake(3, 160);
  },

  onBossIn: function (ev) {
    this.banner.show(ev.b, 'Hold the wall', 2.0, '#F25C68');
    this.bossName.setVisible(true);
    HFUI.setText(this.bossName, ev.b);
    this.bossBar.setVisible(true);
    this.sfx('boss', { volume: 0.7 }, 500);
    this.G.music('theme_siege');
    this.flash = 0.5; this.flashTint = 0xF25C68;
  },

  onCleared: function () {
    var G = this.G, sim = this.sim;
    var bonus = Math.round((25 + sim.wave * 12) * this.stats.furnaceMul);
    this.bonus = bonus;
    sim.coins += bonus;
    this.sfx('clear', { volume: 0.9 }, 0);
    this.fx.ringAt(this.L.W / 2, this.L.boardY - 20, 0xFFD98A, 8, 0.9);
    this.kit.juice.hitStop(110);
    if (this.mode === 'endless') {
      this.banner.show('Night held', 'Salvage +' + bonus, 1.2, '#8CE8A4');
    } else {
      this.banner.show('Wave cleared', 'Salvage +' + bonus, 1.2, '#8CE8A4');
    }
    this.bossBar.setVisible(false);
    this.bossName.setVisible(false);
  },

  onLost: function () {
    this.sfx('defeat', { volume: 0.9 }, 0);
    this.banner.show('Wall breached', 'Salvage kept', 1.6, '#F25C68');
    this.kit.juice.shake(9, 420);
    this.flash = 1; this.flashTint = 0xF25C68;
    this.bossBar.setVisible(false);
    this.bossName.setVisible(false);
  },

  /* Endless Night chains straight into the next night; the Fall campaign
   * hands the run back to the shelter. */
  finish: function (res) {
    var G = this.G, sim = this.sim;
    G.save.salvage += sim.coins;
    G.save.kills += sim.kills;
    if (this.mode === 'endless') {
      if (res > 0) {
        G.recordEndless(sim.wave, sim.kills, sim.coins);
        sim.coins = 0;
        sim.nextStage();
        this.startWave(false);
        G.music(this.musicFor());
        return;
      }
      G.recordEndless(sim.wave, sim.kills, sim.coins);
      G.persist();
      G.go('result', {
        mode: 'endless', win: false, wave: sim.wave, kills: sim.kills,
        salvage: sim.coins, best: G.save.endlessBest,
        score: HF.endlessScore(sim.wave, sim.kills, sim.coins)
      });
      return;
    }
    sim.coins = 0;
    if (res > 0) {
      G.recordWaveClear(sim.wave);
      G.persist();
      G.go('result', {
        mode: 'fall', win: true, wave: sim.wave, kills: sim.kills,
        bonus: this.bonus || 0, boss: sim.script.boss ? sim.script.boss.name : null,
        done: sim.wave >= HF.WAVES
      });
    } else {
      G.persist();
      G.go('result', { mode: 'fall', win: false, wave: sim.wave, kills: sim.kills });
    }
  },

  /* ------------------------------------------------------ view syncing - */
  mobX: function (e) { return this.L.laneX0 + (e.lane + 0.5) * this.L.laneW; },
  mobY: function (e) { return this.L.trackY + e.p * this.L.runLen; },

  syncBoard: function (dt, force) {
    var L = this.L, sim = this.sim;
    if (!L.W) return;
    var scale = L.cell / HFArt.TILE;
    var r, c;
    for (r = 0; r < 6; r++) {
      for (c = 0; c < 6; c++) {
        var g = sim.grid[r][c];
        var v = this.cellView[r][c];
        var img = this.cells[r][c];
        var key = HFArt.pieceKey(g.t, sim.charged && g.pop < 0 && false);
        if (v.key !== key) { v.key = key; img.setTexture(key); }

        var x = L.cellX0 + (c + 0.5) * L.cell;
        var y = L.cellY0 + (r + 0.5) * L.cell - g.oy * L.cell;

        /* swap slide, read from the sim's swap edge, never written back */
        if (sim.sw) {
          var p = HF.ease(HF.clamp(sim.sw.t, 0, 1));
          var d = null;
          if (sim.sw.a.r === r && sim.sw.a.c === c) d = { dr: sim.sw.b.r - r, dc: sim.sw.b.c - c };
          else if (sim.sw.b.r === r && sim.sw.b.c === c) d = { dr: sim.sw.a.r - r, dc: sim.sw.a.c - c };
          if (d) { x += d.dc * L.cell * p; y += d.dr * L.cell * p; }
        }

        /* landing settle: an underdamped pop when a falling piece arrives */
        if (v.prevOy > 0.02 && g.oy <= 0.02) v.settle = 1;
        v.prevOy = g.oy;
        if (v.settle > 0) v.settle = Math.max(0, v.settle - dt * 5.2);

        var s = scale;
        if (g.pop >= 0) s = scale * Math.max(0, 1 - g.pop) * (1 + g.pop * 0.35);
        else if (v.settle > 0 && this.kit.juice.enabled) {
          var k = 1 - v.settle;
          s = scale * (1 + Math.sin(k * Math.PI * 2.2) * 0.10 * v.settle);
        }
        img.setPosition(x, y);
        img.setScale(s);
        img.setVisible(g.pop < 0.98);
        img.setAlpha(g.haz > 0 ? 0.55 : 1);

        var hz = this.hazards[r][c];
        if (g.haz > 0) {
          var hk = HFArt.hazKey(this.act, g.haz);
          if (v.hazKey !== hk) { v.hazKey = hk; hz.setTexture(hk); }
          hz.setPosition(x, y).setScale(scale).setVisible(true);
        } else if (hz.visible) {
          hz.setVisible(false); v.hazKey = '';
        }
      }
    }
    this.syncSelector(dt);
  },

  /* the player entity: Ready, Preview, Resolve, Invalid */
  syncSelector: function (dt) {
    var L = this.L, sel = this.sel;
    sel.t += dt;
    var scale = L.cell / HFArt.TILE;
    var live = !this.over && !this.kit.paused;
    var r = sel.r, c = sel.c;
    var x = L.cellX0 + (c + 0.5) * L.cell;
    var y = L.cellY0 + (r + 0.5) * L.cell;
    var showFocus = live && (sel.keyMode || sel.dragR >= 0 || sel.state !== 'ready');

    if (sel.state === 'resolve' && sel.t > 0.30) sel.state = 'ready';
    if (sel.state === 'invalid' && sel.t > 0.45) sel.state = 'ready';

    if (sel.dragR >= 0) {
      x = L.cellX0 + (sel.dragC + 0.5) * L.cell;
      y = L.cellY0 + (sel.dragR + 0.5) * L.cell;
    }

    /* Ready: a breathing focus ring at 1.0x to 1.04x */
    var breathe = 1 + Math.sin(sel.t * 3.4) * 0.02;
    this.selFocus.setVisible(showFocus);
    if (showFocus) {
      this.selFocus.setPosition(x, y).setScale(scale * breathe);
      this.selFocus.setAlpha(sel.state === 'invalid' ? 0.35 : 0.95);
    }

    /* Preview: solid landing ghost plus a direction arrow */
    var previewing = live && sel.state === 'preview' && sel.tr >= 0;
    this.selGhost.setVisible(previewing);
    this.selArrow.setVisible(previewing);
    if (previewing) {
      var gx = L.cellX0 + (sel.tc + 0.5) * L.cell;
      var gy = L.cellY0 + (sel.tr + 0.5) * L.cell;
      this.selGhost.setPosition(gx, gy).setScale(scale);
      var ang = Math.atan2(sel.tr - sel.dragR, sel.tc - sel.dragC) + Math.PI / 2;
      this.selArrow.setPosition((x + gx) / 2, (y + gy) / 2)
        .setRotation(ang).setDisplaySize(L.cell * 0.42, L.cell * 0.42).setAlpha(0.9);
    }

    /* Invalid: amber cross hatch over the illegal target */
    var bad = live && sel.state === 'invalid';
    this.selCross.setVisible(bad);
    if (bad) {
      var bx = sel.tr >= 0 ? L.cellX0 + (sel.tc + 0.5) * L.cell : x;
      var by = sel.tr >= 0 ? L.cellY0 + (sel.tr + 0.5) * L.cell : y;
      this.selCross.setPosition(bx, by).setScale(scale)
        .setAlpha(HF.clamp(1 - sel.t / 0.45, 0, 1));
    }

    /* Resolve: a short contact flash on the accepted move */
    var res = live && sel.state === 'resolve';
    this.selPop.setVisible(res && this.kit.juice.enabled);
    if (res) {
      var k = HF.clamp(sel.t / 0.30, 0, 1);
      this.selPop.setPosition(x, y).setScale(scale * (0.7 + k * 1.1)).setAlpha(1 - k);
    }
  },

  syncMobs: function (dt) {
    var L = this.L, sim = this.sim;
    for (var i = 0; i < sim.enemies.length; i++) {
      var e = sim.enemies[i], v = this.mobView[i];
      if (!e.on) {
        if (v.img.visible) {
          v.img.setVisible(false); v.bg.setVisible(false); v.fill.setVisible(false);
          v.key = '';
        }
        continue;
      }
      var key = HFArt.mobKey(e.sil);
      if (v.key !== key) { v.key = key; v.img.setTexture(key); }
      var x = this.mobX(e) + Math.sin(e.wob) * (e.sil === 'darter' ? 4 : 1.6);
      var y = L.trackY + e.p * L.runLen;
      var sz = e.r * 3.2;
      v.img.setPosition(x, y);
      v.img.setDisplaySize(sz, sz);
      v.img.setVisible(true);
      /* a walk bob and a lean, both cosmetic and read from sim edges only */
      v.img.setRotation(Math.sin(e.wob * 0.6) * 0.05);
      var tint = this.act.hordeTint;
      if (e.elite) tint = 0xFFD98A;
      if (e.boss) tint = 0xFFFFFF;
      if (e.stun > 0) tint = 0xC9D6E6;
      if (e.slow > 0) tint = 0x9CD8F2;
      if (e.ven > 0) tint = 0xCBA6F5;
      if (e.flash > 0) tint = 0xFFFFFF;
      HFUI.setTint(v.img, tint);
      /* the horde fades in as it steps past the hive line */
      var alpha = e.shield > 0 ? 0.82 : 1;
      if (e.p < 0) alpha *= HF.clamp(1 + e.p * 9, 0.12, 1);
      v.img.setAlpha(alpha);

      var hurt = e.hp < e.max - 0.01;
      if (hurt) {
        var bw = Math.max(20, sz * 0.9);
        v.bg.setVisible(true).setPosition(x - bw / 2, y - sz * 0.62).setDisplaySize(bw, 5);
        v.fill.setVisible(true).setPosition(x - bw / 2 + 1, y - sz * 0.62)
          .setDisplaySize(Math.max(0, (bw - 2) * HF.clamp(e.hp / e.max, 0, 1)), 3);
        HFUI.setTint(v.fill, e.boss ? 0xFFD98A : 0xF25C68);
      } else if (v.bg.visible) {
        v.bg.setVisible(false); v.fill.setVisible(false);
      }
    }
  },

  syncShots: function () {
    var L = this.L, sim = this.sim;
    for (var i = 0; i < sim.shots.length; i++) {
      var s = sim.shots[i], v = this.shotView[i];
      if (!s.on) {
        if (v.img.visible) v.img.setVisible(false);
        continue;
      }
      var key = 'hf_s_' + s.kind;
      if (v.key !== key) { v.key = key; v.img.setTexture(key); }
      v.img.setPosition(L.laneX0 + (s.lane + 0.5) * L.laneW, L.trackY + s.p * L.runLen);
      v.img.setVisible(true);
      v.img.setScale(s.splash ? 1.35 : 1, s.pierce ? 1.5 : 1);
      v.img.setAlpha(0.95);
    }
  },

  /* the horde one step ahead: pending spawn chevrons and lane danger wash */
  syncTelegraph: function (dt) {
    var sim = this.sim;
    var th = sim.threat(this.threat);
    for (var i = 0; i < 6; i++) {
      var t = th[i];
      var chev = this.laneChev[i];
      var wash = this.laneWash[i];
      if (t.pending > 0) {
        var pulse = 0.45 + 0.35 * Math.sin(this.time.now * 0.006 + i);
        chev.setAlpha(Math.min(0.95, 0.35 + t.pending * 0.22) * pulse + 0.2);
        chev.setScale(1 + Math.min(2, t.pending) * 0.10);
        HFUI.setTint(chev, t.pending > 2 ? 0xF25C68 : 0xFFD98A);
      } else if (chev.alpha !== 0) chev.setAlpha(0);

      var danger = t.danger;
      if (danger > 0) {
        var blink = t.eta < 2.2 ? (0.55 + 0.45 * Math.sin(this.time.now * 0.016)) : 1;
        wash.setAlpha(HF.clamp(danger * 0.5, 0, 0.55) * blink);
        HFUI.setTint(wash, t.eta < 2.2 ? 0xF25C68 : 0xF7B03C);
      } else if (wash.alpha !== 0) wash.setAlpha(0);
    }
  },

  syncHud: function (dt) {
    var sim = this.sim, G = this.G, L = this.L;
    var act = this.act;
    HFUI.setText(this.actText, this.mode === 'endless'
      ? ('Endless Night - ' + act.name)
      : ('Act ' + (act.id + 1) + ' - ' + act.name));
    HFUI.setText(this.waveText, this.mode === 'endless'
      ? ('Night ' + sim.wave)
      : ('Wave ' + sim.wave + ' / ' + HF.WAVES));
    HFUI.setText(this.salvText, String(G.save.salvage + sim.coins));

    var frac = sim.wallHp / Math.max(1, sim.wallMax);
    this.wallBar.set(frac, frac > 0.5 ? 0x5BCB77 : (frac > 0.22 ? 0xF7C948 : 0xF25C68));
    this.waveBar.set(sim.waveProgress(), 0x7B95B4);

    HFUI.setText(this.flareCount, String(sim.flares));
    this.flareBtn.setEnabled(sim.flares > 0 && !this.over);

    var boss = sim.bossRef;
    if (boss && boss.on) {
      this.bossBar.setVisible(true);
      this.bossName.setVisible(true);
      this.bossBar.set(HF.clamp(boss.hp / boss.max, 0, 1), boss.shield > 0 ? 0x7FD8FF : 0xF25C68);
    } else if (this.bossBar.bg.visible) {
      this.bossBar.setVisible(false);
      this.bossName.setVisible(false);
    }
  },

  /* ----------------------------------------------------------- pause --- */
  openPause: function () {
    if (this.pauseCard || this.over) return;
    var self = this;
    this.kit.pause('menu');
    var W = this.L.W, H = this.L.H;
    this.pauseCard = this.add.container(0, 0).setDepth(120);
    var dim = this.add.image(0, 0, 'hf_flash').setOrigin(0, 0).setDisplaySize(W, H)
      .setTint(0x060A10).setAlpha(0.86);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, dim.width, dim.height), Phaser.Geom.Rectangle.Contains);
    this.pauseCard.add(dim);
    var card = this.add.image(W / 2, H * 0.44, 'hf_card').setDisplaySize(Math.min(320, W * 0.84), 300);
    this.pauseCard.add(card);
    var title = HFUI.text(this, W / 2, H * 0.44 - 118, 'Paused', 24, '#FFD98A', 800).setOrigin(0.5, 0.5);
    this.pauseCard.add(title);
    var line = HFUI.text(this, W / 2, H * 0.44 - 88,
      this.mode === 'endless' ? ('Night ' + this.sim.wave) : ('Wave ' + this.sim.wave + ' of ' + HF.WAVES),
      14, '#9FB3C8', 600).setOrigin(0.5, 0.5);
    this.pauseCard.add(line);

    var nav = HFUI.Nav();
    nav.active = true;
    var by = H * 0.44 - 46;
    nav.add(HFUI.Button(this, {
      x: W / 2, y: by, w: Math.min(260, W * 0.7), h: 52, label: 'Resume', kind: 'go',
      container: this.pauseCard, onTap: function () { self.closePause(); }
    }));
    nav.add(HFUI.Button(this, {
      x: W / 2, y: by + 62, w: Math.min(260, W * 0.7), h: 52, label: 'Restart wave', kind: 'main',
      container: this.pauseCard, onTap: function () { self.closePause(); self.kit.restart(); }
    }));
    nav.add(HFUI.Button(this, {
      x: W / 2, y: by + 124, w: Math.min(260, W * 0.7), h: 52, label: 'Settings', kind: 'main',
      container: this.pauseCard, onTap: function () { self.G.openSettings(); }
    }));
    nav.add(HFUI.Button(this, {
      x: W / 2, y: by + 186, w: Math.min(260, W * 0.7), h: 52, label: 'Leave run', kind: 'ghost',
      container: this.pauseCard, onTap: function () {
        self.closePause(true);
        self.G.save.salvage += self.sim.coins;
        self.G.persist();
        self.G.go('shelter');
      }
    }));
    this.pauseNav = nav;
    nav.paint();
    this.G.audio('click');
  },

  layoutPause: function () {
    if (!this.pauseCard) return;
    this.closePause(true);
    this.openPause();
  },

  closePause: function (silent) {
    if (!this.pauseCard) return;
    this.pauseCard.destroy(true);
    this.pauseCard = null;
    this.pauseNav = null;
    this.kit.resume('menu');
    if (!silent) this.G.audio('click');
  },

  restart: function () {
    this.fx.clear();
    this.sim.reset(this.sim.wave);
    this.sel.state = 'ready';
    this.over = 0; this.overT = 0;
    this.startWave(false);
  },

  /* ------------------------------------------------------ verification - */
  refreshVerify: function () {
    /* a scene that has been stopped must never keep writing the probe state:
     * Phaser runs one more update after scene.stop() is queued */
    if (!this.scene.isActive()) return;
    var v = this.G.verify, sim = this.sim;
    v.scene = 'play';
    v.mode = this.mode;
    v.stage = sim.wave;
    v.act = this.act.id + 1;
    v.actName = this.act.name;
    v.wall = Math.round(sim.wallHp);
    v.wallMax = Math.round(sim.wallMax);
    v.health = Math.round(100 * sim.wallHp / Math.max(1, sim.wallMax));
    v.kills = sim.kills;
    v.salvage = this.G.save.salvage + sim.coins;
    v.remaining = sim.remaining();
    v.progress = this.mode === 'endless'
      ? sim.wave
      : Math.round(100 * (sim.wave - 1 + sim.waveProgress()) / HF.WAVES);
    v.score = this.mode === 'endless'
      ? HF.endlessScore(sim.wave, sim.kills, sim.coins)
      : (sim.kills * 10 + this.G.save.salvage);
    v.boss = sim.bossRef ? sim.bossRef.name : null;
    v.hazards = sim.hazardCount();
    v.flares = sim.flares;
    v.over = !!sim.result;
    v.paused = !!this.kit.paused;
  }
});
