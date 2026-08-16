/* Kinetic Burst - battle scene.
 *
 * Owns the board view, the enemy and fighter cards, the trace, the super
 * cut-in and the clash. It reads sim edges and never writes sim state
 * outside the explicit trace/commit/burst calls.
 */
var PlayScene = new Phaser.Class({
  Extends: Phaser.Scene,
  initialize: function PlayScene() { Phaser.Scene.call(this, { key: 'play' }); },

  /* ------------------------------------------------------------- init */
  init: function (data) {
    var G = window.KBGame;
    this.mode = (data && data.mode) || 'road';
    this.stageIndex = KB.clamp((data && data.stage) | 0, 0, KB.STAGE_COUNT - 1);
    this.trialIndex = KB.clamp((data && data.trial) | 0, 0, KB.TRIAL_COUNT - 1);
    this.phase = 'idle';                 /* idle | resolve | cutin | clash | over */
    this.busy = false;
    this.G = G;
    this.kit = G.kit;
  },

  /* ----------------------------------------------------------- create */
  create: function () {
    var self = this;
    var G = this.G, kit = this.kit;

    this.buildBattle();
    this.ins = KBUI.insets();
    this.layout();

    this.bg = KBUI.backdrop(this, this.arc, -20);
    this.world = this.add.container(0, 0).setDepth(1);
    this.fxLayer = this.add.container(0, 0).setDepth(40);
    this.uiLayer = this.add.container(0, 0).setDepth(50);
    this.fx = KBFx.create(this, this.fxLayer, kit);

    this.blockRects = [];
    this.buildHud();
    this.buildBoard();
    this.buildEnemies();
    this.buildTeam();
    this.buildOverlays();

    this.toast = KBUI.transients(this, this.uiLayer, {
      isLive: function () { return self.phase !== 'over' && !self.resultOpen; },
      reduced: function () { return !kit.juice.enabled; }
    });
    this.coach = KBUI.coach(this, this.uiLayer);

    this.gest = KBUI.gestures(this, kit, {
      onDown: function (id, x, y) { self.onDown(id, x, y); },
      onMove: function (id, x, y) { self.onMove(id, x, y); },
      onUp: function (id, x, y) { self.onUp(id, x, y); }
    });

    this.keyState = {};
    this.cursor = { c: 3, r: 2 };
    this.kbTrace = false;
    this.onKey = function (e) { self.handleKey(e); };
    window.addEventListener('keydown', this.onKey);
    this.events.once('shutdown', function () {
      window.removeEventListener('keydown', self.onKey);
      self.scale.off('resize', self.onResize);
    });

    this.onResize = function () { if (self.scene.isActive()) self.scene.restart(self.restartData()); };
    this.scale.on('resize', this.onResize);

    G.music(this.arc.music);
    this.tutorialStep = G.save.tutorial ? -1 : 0;
    this.showTutorial();
    this.refreshAll();
    this.refreshVerify();

    this.startBanner();
  },

  restartData: function () {
    return { mode: this.mode, stage: this.stageIndex, trial: this.trialIndex };
  },

  /* --------------------------------------------------------- sim setup */
  buildBattle: function () {
    var G = this.G;
    var team = [];
    var ids = G.save.team;
    var rules = {};
    var waves, seed;
    if (this.mode === 'trial') {
      var tr = KB.trial(this.trialIndex);
      ids = tr.team;
      rules = {
        noHeart: !!tr.noHeart, halfHp: !!tr.halfHp, chargeMul: tr.chargeMul || 1,
        minRun: tr.minRun || 0, keepCharge: !!tr.keepCharge, noHeal: !!tr.noHeal
      };
      waves = KB.trialWaves(tr);
      seed = 0x7A1A + this.trialIndex * 4211;
      this.arc = KB.arc(tr.arc);
      this.title = tr.name;
    } else if (this.mode === 'endless') {
      var first = KB.endlessWave(0);
      waves = [first.foes];
      seed = (Date.now() & 0xFFFF) ^ 0x9E37;
      this.arc = KB.arc(0);
      this.title = 'Endless Surge';
    } else {
      var st = KB.stage(this.stageIndex);
      waves = st.waves;
      seed = 0x4B42 + this.stageIndex * 7919;
      this.arc = KB.arc(st.arc);
      this.title = st.name;
    }
    for (var i = 0; i < 3; i++) {
      var id = KB.clamp(ids[i] | 0, 0, KB.FIGHTER_COUNT - 1);
      team.push({ id: id, xp: G.save.xp[id] | 0 });
    }
    this.battle = new KB.Battle({
      mode: this.mode, stage: this.stageIndex, trial: this.trialIndex,
      team: team, waves: waves, seed: seed, rules: rules
    });
    this.arcIndex = KB.ARCS.indexOf(this.arc);
    if (this.arcIndex < 0) this.arcIndex = 0;
  },

  /* ------------------------------------------------------------ layout */
  layout: function () {
    var W = this.scale.width, H = this.scale.height;
    var ins = this.ins;
    var M = KB.M;
    var pad = 8;
    var cell = Math.floor((Math.min(W, 460) - 24 - pad * 2) / M.cols);
    cell = KB.clamp(cell, 30, 58);
    var boardW = M.cols * cell + pad * 2;
    var boardH = M.rows * cell + pad * 2;
    var bottomGap = Math.max(18, Math.min(58, H * 0.06)) + ins.bottom;
    var boardY = H - bottomGap - boardH;
    var hudY = ins.top + 24;
    var teamH = 66;
    var teamY = boardY - 12 - teamH;
    var enemyTop = hudY + 52;                  /* leaves the coach strip room */
    var enemyBand = Math.max(110, teamY - 26 - enemyTop);
    var enemyH = KB.clamp(enemyBand, 96, 196);
    this.L = {
      W: W, H: H, cell: cell, pad: pad,
      boardW: boardW, boardH: boardH,
      boardX: Math.round((W - boardW) / 2), boardY: Math.round(boardY),
      hudY: hudY, teamY: Math.round(teamY), teamH: teamH,
      enemyTop: Math.round(enemyTop), enemyH: Math.round(enemyH),
      enemyMid: Math.round(enemyTop + enemyBand / 2),
      readY: Math.round(boardY - 12 - teamH - 22)
    };
  },

  cellX: function (c) { return this.L.boardX + this.L.pad + c * this.L.cell + this.L.cell / 2; },
  cellY: function (r) { return this.L.boardY + this.L.pad + r * this.L.cell + this.L.cell / 2; },
  cellAt: function (x, y) {
    var L = this.L;
    var c = Math.floor((x - L.boardX - L.pad) / L.cell);
    var r = Math.floor((y - L.boardY - L.pad) / L.cell);
    if (c < 0 || c >= KB.M.cols || r < 0 || r >= KB.M.rows) return null;
    return { c: c, r: r };
  },

  /* --------------------------------------------------------------- HUD */
  buildHud: function () {
    var self = this, L = this.L, ins = this.ins;
    var hud = this.add.container(0, 0).setDepth(51);
    this.uiLayer.add(hud);

    var barKey = 'kb_hudbar_' + Math.round(L.W) + 'x' + Math.round(L.hudY + 22);
    KBArt.bakeCard(this, barKey, L.W, L.hudY + 22, 0, 0x0D1425, 0.82, null, 0);
    var bar = this.add.image(0, 0, barKey).setOrigin(0, 0);
    hud.add(bar);

    this.pauseBtn = KBUI.button(this, {
      x: ins.left + 30, y: L.hudY, icon: 'pause', size: 44, fill: 0x243453,
      onPress: function () { self.openPause(); }
    });
    hud.add(this.pauseBtn.root);
    this.blockRects.push({ x: ins.left + 6, y: L.hudY - 24, w: 52, h: 52 });

    this.titleText = KBUI.text(this, L.W / 2, L.hudY - 8, this.title, 15, 750, '#F7FBFF');
    hud.add(this.titleText);
    this.subText = KBUI.text(this, L.W / 2, L.hudY + 12, '', 12, 650, '#9FB0CA');
    hud.add(this.subText);

    this.turnChip = KBUI.chip(this, {
      x: L.W - ins.right - 66, y: L.hudY, icon: 'clock', value: '0', w: 72, h: 34, tint: 0xF7C948
    });
    hud.add(this.turnChip.root);

    /* live trace readout, docked to the board top corners */
    this.chainChip = KBUI.chip(this, {
      x: L.boardX + 4, y: L.readY, icon: 'burst', value: 'x1.00', w: 86, h: 30, size: 14, tint: 0xF7C948
    });
    this.chainChip.root.setX(L.boardX + 47);
    this.dmgChip = KBUI.chip(this, {
      x: L.boardX + L.boardW - 52, y: L.readY, icon: 'target', value: '0', w: 96, h: 30, size: 14, tint: 0xFF9AA4
    });
    this.uiLayer.add(this.chainChip.root);
    this.uiLayer.add(this.dmgChip.root);
    this.chainChip.root.setAlpha(0.35);
    this.dmgChip.root.setAlpha(0.35);
  },

  /* ------------------------------------------------------------- board */
  buildBoard: function () {
    var L = this.L;
    var key = 'kb_board_' + this.arc.id + '_' + L.cell;
    KBArt.bakeBoard(this, key, L.cell, L.pad, KB.M.cols, KB.M.rows, this.arc);
    this.boardImg = this.add.image(L.boardX, L.boardY, key).setOrigin(0, 0);
    this.world.add(this.boardImg);

    this.orbLayer = this.add.container(0, 0);
    this.world.add(this.orbLayer);
    this.orbPool = [];
    this.orbMap = Object.create(null);
    for (var i = 0; i < KB.M.cols * KB.M.rows * 2; i++) {
      var img = this.add.image(0, 0, KBArt.orbKey(0, 'idle'));
      img.setVisible(false).setActive(false);
      this.orbLayer.add(img);
      this.orbPool.push(img);
    }

    this.traceGfx = this.add.graphics();
    this.traceGfx.setDepth(2);
    this.world.add(this.traceGfx);

    this.selector = this.add.image(this.cellX(3), this.cellY(2), KBArt.selKey('ready'));
    this.selector.setDisplaySize(L.cell * 1.18, L.cell * 1.18);
    this.selector.setAlpha(0.6);
    this.selector.setDepth(3);
    this.world.add(this.selector);
    this.selState = 'ready';
    this.selPulse = 0;

    this.syncBoard(true);
  },

  takeOrbImg: function () {
    var img = this.orbPool.pop();
    if (!img) {
      img = this.add.image(0, 0, KBArt.orbKey(0, 'idle'));
      this.orbLayer.add(img);
    }
    img.setVisible(true).setActive(true).setAlpha(1).setAngle(0);
    return img;
  },
  releaseOrbImg: function (img) {
    img.setVisible(false).setActive(false);
    this.tweens.killTweensOf(img);
    this.orbPool.push(img);
  },

  syncBoard: function (instant) {
    var b = this.battle, L = this.L;
    var seen = Object.create(null);
    for (var r = 0; r < KB.M.rows; r++) {
      for (var c = 0; c < KB.M.cols; c++) {
        var orb = b.grid[r][c];
        if (!orb) continue;
        seen[orb.id] = 1;
        var img = this.orbMap[orb.id];
        if (!img) {
          img = this.takeOrbImg();
          this.orbMap[orb.id] = img;
          img.setTexture(KBArt.orbKey(orb.t, 'idle'));
          img.__lit = false;
          img.__type = orb.t;
          img.setPosition(this.cellX(c), instant ? this.cellY(r) : this.cellY(r) - L.cell * 2);
        }
        img.setDisplaySize(L.cell * 0.94, L.cell * 0.94);
        if (instant) img.setPosition(this.cellX(c), this.cellY(r));
      }
    }
    for (var id in this.orbMap) {
      if (!seen[id]) { this.releaseOrbImg(this.orbMap[id]); delete this.orbMap[id]; }
    }
  },

  paintPath: function () {
    var b = this.battle, L = this.L;
    var lit = Object.create(null);
    var i;
    for (i = 0; i < b.path.length; i++) {
      var cell = b.path[i];
      var orb = b.orbAt(cell.c, cell.r);
      if (orb) lit[orb.id] = 1;
    }
    for (var id in this.orbMap) {
      var img = this.orbMap[id];
      var on = !!lit[id];
      if (img.__lit === on) continue;
      img.__lit = on;
      var t = img.__type == null ? 0 : img.__type;
      img.setTexture(KBArt.orbKey(t, on ? 'lit' : 'idle'));
      img.setDisplaySize(L.cell * (on ? 1.02 : 0.94), L.cell * (on ? 1.02 : 0.94));
    }
    /* the trace line: at most 30 segments, cheap to replay */
    var g = this.traceGfx;
    g.clear();
    if (b.path.length < 1) return;
    var head = b.orbAt(b.path[0].c, b.path[0].r);
    var col = head ? KB.KI[head.t].edge : 0xFFFFFF;
    g.lineStyle(Math.max(4, L.cell * 0.14), col, 0.85);
    g.beginPath();
    g.moveTo(this.cellX(b.path[0].c), this.cellY(b.path[0].r));
    for (i = 1; i < b.path.length; i++) g.lineTo(this.cellX(b.path[i].c), this.cellY(b.path[i].r));
    g.strokePath();
  },

  /* ------------------------------------------------------ enemy cards */
  buildEnemies: function () {
    var L = this.L;
    if (this.enemyLayer) this.enemyLayer.destroy(true);
    this.enemyLayer = this.add.container(0, 0).setDepth(6);
    this.world.add(this.enemyLayer);
    this.enemyCards = [];
    var list = this.battle.enemies;
    var n = Math.max(1, list.length);
    var gap = 8;
    var cw = Math.min(126, Math.floor((L.W - 24 - gap * (n - 1)) / n));
    var ch = Math.min(L.enemyH, 176);
    var totalW = cw * n + gap * (n - 1);
    var x0 = (L.W - totalW) / 2;
    var cy0 = L.enemyMid;
    /* arena floor: one baked strip so the enemy band reads as a place */
    var floorKey = 'kb_floor_' + Math.round(L.W) + '_' + this.arc.id;
    KBArt.bakeCard(this, floorKey, L.W - 20, 26, 13, this.arc.frame, 0.7, this.arc.frameEdge, 0.35);
    var floor = this.add.image(L.W / 2, cy0 + ch / 2 + 2, floorKey);
    this.enemyLayer.add(floor);

    var cardKey = 'kb_ecard_' + cw + 'x' + ch;
    KBArt.bakeCard(this, cardKey, cw, ch, 14, 0x18213A, 0.94, 0x6B85B5, 0.5);
    var selKey = 'kb_ecards_' + cw + 'x' + ch;
    KBArt.bakeCard(this, selKey, cw, ch, 14, 0x2A3560, 0.98, 0xF7FBFF, 0.9);

    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var cx = x0 + i * (cw + gap) + cw / 2;
      var cy = cy0;
      var card = this.add.container(cx, cy);
      var bg = this.add.image(0, 0, cardKey);
      card.add(bg);
      var sel = this.add.image(0, 0, selKey);
      sel.setVisible(false);
      card.add(sel);

      var portrait = this.add.image(0, -ch * 0.22, e.boss ? ('kb_boss_' + this.arcIndex) : KBArt.orbKey(e.type, 'idle'));
      var psz = e.boss ? ch * 0.42 : ch * 0.32;
      portrait.setDisplaySize(psz, psz);
      if (!e.boss) portrait.setTint(KBArt.lighten(KB.KI[e.type].face, 0.05));
      card.add(portrait);

      var name = KBUI.text(this, 0, ch * 0.06, e.name, e.name.length > 11 ? 11 : 12.5, 750, '#F7FBFF');
      name.setWordWrapWidth(cw - 10);
      card.add(name);

      var hpBar = KBUI.bar(this, card, -cw / 2 + 8, ch * 0.24, cw - 16, 7, 0xF25C68);
      var hpText = KBUI.text(this, 0, ch * 0.36, '', 12, 700, '#DCE6F5');
      card.add(hpText);

      var tgIcon = this.add.image(-cw / 2 + 16, ch * 0.44, 'kb_ic_clock');
      tgIcon.setDisplaySize(14, 14).setTint(0xF7C948);
      card.add(tgIcon);
      var tgText = KBUI.text(this, 4, ch * 0.44, '', 12.5, 750, '#F7C948');
      tgText.setOrigin(0, 0.5);
      tgText.setX(-cw / 2 + 26);
      card.add(tgText);

      this.enemyLayer.add(card);
      this.enemyCards.push({
        root: card, sel: sel, hp: hpBar, hpText: hpText, name: name,
        tg: tgText, portrait: portrait, x: cx, y: cy, w: cw, h: ch, slot: i
      });
    }
    this.enemyRect = { x: x0, y: cy0 - ch / 2, w: totalW, h: ch, cw: cw, gap: gap, n: list.length, x0: x0 };
  },

  /* ----------------------------------------------------- fighter cards */
  buildTeam: function () {
    var L = this.L;
    this.teamLayer = this.add.container(0, 0).setDepth(6);
    this.world.add(this.teamLayer);
    this.teamCards = [];
    var gap = 8;
    var cw = Math.floor((L.boardW - gap * 2) / 3);
    var ch = L.teamH;
    var x0 = L.boardX;
    var cardKey = 'kb_fcard_' + cw + 'x' + ch;
    KBArt.bakeCard(this, cardKey, cw, ch, 12, 0x1A2440, 0.95, 0x6B85B5, 0.45);
    var frontKey = 'kb_fcardf_' + cw + 'x' + ch;
    KBArt.bakeCard(this, frontKey, cw, ch, 12, 0x2B3A66, 1, 0xF7FBFF, 0.9);

    for (var i = 0; i < 3; i++) {
      var f = this.battle.team[i];
      var cx = x0 + i * (cw + gap) + cw / 2;
      var cy = L.teamY + ch / 2;
      var card = this.add.container(cx, cy);
      card.add(this.add.image(0, 0, cardKey));
      var front = this.add.image(0, 0, frontKey);
      front.setVisible(false);
      card.add(front);

      var badge = this.add.image(-cw / 2 + 22, -8, KBArt.badgeKey(f.fid));
      badge.setDisplaySize(34, 34);
      card.add(badge);

      var nm = KBUI.text(this, -cw / 2 + 42, -20, f.def.name.split(' ')[0], 12.5, 750, '#F7FBFF');
      nm.setOrigin(0, 0.5);
      card.add(nm);

      var hp = KBUI.bar(this, card, -cw / 2 + 42, -3, cw - 50, 6, 0x5BCB77);
      var chg = KBUI.bar(this, card, -cw / 2 + 42, 9, cw - 50, 7, KB.KI[f.def.type].face);

      var stateIcon = this.add.image(cw / 2 - 15, 20, 'kb_ic_burst');
      stateIcon.setDisplaySize(15, 15).setTint(0xF7C948).setVisible(false);
      card.add(stateIcon);
      var chgText = KBUI.text(this, -cw / 2 + 42, 21, '', 11.5, 700, '#9FB0CA');
      chgText.setOrigin(0, 0.5);
      card.add(chgText);

      this.teamLayer.add(card);
      this.teamCards.push({
        root: card, front: front, hp: hp, charge: chg, badge: badge,
        chgText: chgText, armIcon: stateIcon, x: cx, y: cy, w: cw, h: ch, slot: i
      });
    }
    this.teamRect = { x: x0, y: L.teamY, w: L.boardW, h: ch, cw: cw, gap: gap };
  },

  /* --------------------------------------------------------- overlays */
  buildOverlays: function () {
    var L = this.L;
    /* damage floaters, pooled */
    this.floaters = [];
    for (var i = 0; i < 5; i++) {
      var t = KBUI.text(this, 0, 0, '', 20, 800, '#FFFFFF');
      t.setDepth(45).setVisible(false);
      this.uiLayer.add(t);
      this.floaters.push({ t: t, on: false, life: 0, x: 0, y: 0 });
    }
    this.floatNext = 0;

    /* cut-in overlay */
    this.cutin = this.add.container(0, 0).setDepth(70);
    this.cutin.setVisible(false);
    this.uiLayer.add(this.cutin);
    var bandKey = 'kb_cutband_' + Math.round(L.W);
    KBArt.bakeCard(this, bandKey, L.W, 132, 0, 0x101828, 0.95, 0xF7FBFF, 0.25);
    this.cutBand = this.add.image(L.W / 2, L.H * 0.34, bandKey);
    this.cutin.add(this.cutBand);
    this.cutBadge = this.add.image(L.W * 0.24, L.H * 0.34, KBArt.badgeKey(0));
    this.cutBadge.setDisplaySize(84, 84);
    this.cutin.add(this.cutBadge);
    this.cutName = KBUI.text(this, L.W * 0.56, L.H * 0.34 - 18, '', 19, 800, '#FFFFFF');
    this.cutMove = KBUI.text(this, L.W * 0.56, L.H * 0.34 + 12, '', 14, 700, '#F7C948');
    this.cutin.add(this.cutName); this.cutin.add(this.cutMove);

    /* clash bar */
    this.clashBox = this.add.container(L.W / 2, L.H * 0.62).setDepth(72);
    this.clashBox.setVisible(false);
    this.uiLayer.add(this.clashBox);
    var cw = Math.min(300, L.W - 60);
    KBArt.bakeCard(this, 'kb_clashbg_' + Math.round(cw), cw, 42, 21, 0x101828, 0.95, 0x6B85B5, 0.6);
    this.clashBox.add(this.add.image(0, 0, 'kb_clashbg_' + Math.round(cw)));
    KBArt.bakeCard(this, 'kb_clashzone', 72, 30, 10, 0xF7C948, 0.5, 0xFFE9A6, 0.9);
    this.clashZone = this.add.image(0, 0, 'kb_clashzone');
    this.clashZone.setDisplaySize(cw * 0.22, 30);
    this.clashBox.add(this.clashZone);
    this.clashMark = this.add.image(0, 0, 'kb_white');
    this.clashMark.setDisplaySize(6, 34).setTint(0xFFFFFF);
    this.clashBox.add(this.clashMark);
    this.clashHint = KBUI.text(this, 0, -34, 'Tap in the gold zone', 14, 700, '#F7FBFF');
    this.clashBox.add(this.clashHint);
    this.clashW = cw;

    /* skip control for the cut-in, thumb reachable */
    var self = this;
    this.skipBtn = KBUI.button(this, {
      x: L.W - this.ins.right - 34, y: L.H * 0.34 + 88, icon: 'skip', size: 46, fill: 0x243453,
      onPress: function () { self.skipCutin(); }
    });
    this.skipBtn.root.setDepth(73).setVisible(false);
    this.uiLayer.add(this.skipBtn.root);
  },

  /* ------------------------------------------------------------ banner */
  startBanner: function () {
    var self = this;
    var sub;
    if (this.mode === 'road') sub = 'Stage ' + (this.stageIndex + 1) + ' of 30';
    else if (this.mode === 'trial') sub = KB.trial(this.trialIndex).rule;
    else sub = 'Survive as long as the board allows';
    this.resultOpen = true;                    /* boundary: banner allowed */
    this.toast.banner(this.title, {
      sub: sub, hold: 900, y: this.scale.height * 0.36,
      onDone: function () { self.resultOpen = false; }
    });
  },

  /* -------------------------------------------------------------- input */
  inRect: function (x, y, r) {
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  },
  blocked: function (x, y) {
    for (var i = 0; i < this.blockRects.length; i++) {
      if (this.inRect(x, y, this.blockRects[i])) return true;
    }
    return false;
  },

  onDown: function (id, x, y) {
    if (this.kit.paused) return;
    if (this.phase === 'clash') { this.resolveClash(); return; }
    if (this.phase === 'cutin') { return; }
    if (this.phase !== 'idle' || this.busy) return;
    if (this.blocked(x, y)) return;

    /* enemy cards */
    var er = this.enemyRect;
    if (er && y >= er.y && y <= er.y + er.h) {
      for (var i = 0; i < this.enemyCards.length; i++) {
        var c = this.enemyCards[i];
        if (x >= c.x - c.w / 2 && x <= c.x + c.w / 2) {
          if (this.battle.setTarget(i)) {
            this.G.audio('ui_click');
            this.refreshEnemies();
            this.advanceTutorial('target');
          }
          return;
        }
      }
      return;
    }
    /* fighter cards */
    var tr = this.teamRect;
    if (tr && y >= tr.y && y <= tr.y + tr.h) {
      for (var k = 0; k < this.teamCards.length; k++) {
        var f = this.teamCards[k];
        if (x >= f.x - f.w / 2 && x <= f.x + f.w / 2) {
          if (this.battle.canBurst(k)) this.beginCutin(k);
          else if (this.battle.setFront(k)) { this.G.audio('ui_click'); this.refreshTeam(); this.refreshEnemies(); }
          else this.G.audio('invalid');
          return;
        }
      }
      return;
    }
    /* board */
    var cell = this.cellAt(x, y);
    if (cell && this.battle.traceStart(cell.c, cell.r, id)) {
      this.G.audio('trace_open');
      this.setSelector('preview');
      this.cursor.c = cell.c; this.cursor.r = cell.r;
      this.paintPath();
      this.updateReadout();
      this.advanceTutorial('trace');
    }
  },

  onMove: function (id, x, y) {
    if (this.kit.paused || !this.battle.tracing) return;
    if (this.battle.tracePointer !== id) return;
    var cell = this.cellAt(x, y);
    if (!cell) return;
    var res = this.battle.traceExtend(cell.c, cell.r);
    if (res === 'none') return;
    this.cursor.c = cell.c; this.cursor.r = cell.r;
    var n = this.battle.path.length;
    this.G.audio('link', { rate: KB.clamp(0.86 + n * 0.045, 0.8, 2.0), volume: 0.55 });
    var orb = this.battle.orbAt(cell.c, cell.r);
    if (orb) this.fx.spark2(this.cellX(cell.c), this.cellY(cell.r), KB.KI[orb.t].edge);
    this.paintPath();
    this.updateReadout();
  },

  onUp: function (id, x, y) {
    if (this.kit.paused) return;
    if (!this.battle.tracing || this.battle.tracePointer !== id) return;
    this.commitTrace();
  },

  handleKey: function (e) {
    if (this.kit.paused) return;
    var b = this.battle;
    var code = e.code;
    if (code === 'Escape' || code === 'KeyP') { e.preventDefault(); this.openPause(); return; }
    if (this.phase === 'clash') { if (code === 'Space' || code === 'Enter') { e.preventDefault(); this.resolveClash(); } return; }
    if (this.phase === 'cutin') { if (code === 'Space' || code === 'Enter') { e.preventDefault(); this.skipCutin(); } return; }
    if (this.phase !== 'idle' || this.busy) return;
    var moved = false;
    if (code === 'ArrowLeft') { this.cursor.c = KB.clamp(this.cursor.c - 1, 0, KB.M.cols - 1); moved = true; }
    else if (code === 'ArrowRight') { this.cursor.c = KB.clamp(this.cursor.c + 1, 0, KB.M.cols - 1); moved = true; }
    else if (code === 'ArrowUp') { this.cursor.r = KB.clamp(this.cursor.r - 1, 0, KB.M.rows - 1); moved = true; }
    else if (code === 'ArrowDown') { this.cursor.r = KB.clamp(this.cursor.r + 1, 0, KB.M.rows - 1); moved = true; }
    else if (code === 'Space' || code === 'Enter') {
      e.preventDefault();
      if (!b.tracing) {
        if (b.traceStart(this.cursor.c, this.cursor.r, 'kb')) {
          this.G.audio('trace_open');
          this.setSelector('preview');
          this.paintPath(); this.updateReadout();
          this.advanceTutorial('trace');
        }
      } else this.commitTrace();
      return;
    } else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
      e.preventDefault();
      var slot = (+code.slice(5)) - 1;
      if (this.battle.canBurst(slot)) this.beginCutin(slot);
      else if (this.battle.setFront(slot)) { this.G.audio('ui_click'); this.refreshTeam(); this.refreshEnemies(); }
      return;
    } else if (code === 'KeyQ' || code === 'KeyE') {
      e.preventDefault();
      var n = this.battle.enemies.length;
      var dir = code === 'KeyQ' ? -1 : 1;
      for (var i = 1; i <= n; i++) {
        var idx = ((this.battle.target + dir * i) % n + n) % n;
        if (this.battle.setTarget(idx)) break;
      }
      this.G.audio('ui_click');
      this.refreshEnemies();
      this.advanceTutorial('target');
      return;
    } else if (code === 'KeyR') { e.preventDefault(); this.kit.restart(); return; }
    if (moved) {
      e.preventDefault();
      if (b.tracing) {
        var res = b.traceExtend(this.cursor.c, this.cursor.r);
        if (res !== 'none') {
          this.G.audio('link', { rate: KB.clamp(0.86 + b.path.length * 0.045, 0.8, 2), volume: 0.55 });
          this.paintPath(); this.updateReadout();
        }
      }
      this.moveSelector();
    }
  },

  /* ----------------------------------------------------------- selector */
  setSelector: function (state) {
    if (this.selState === state) return;
    this.selState = state;
    this.selector.setTexture(KBArt.selKey(state));
    this.selector.setDisplaySize(this.L.cell * (state === 'resolve' ? 1.4 : 1.18),
      this.L.cell * (state === 'resolve' ? 1.4 : 1.18));
    this.selector.setAlpha(state === 'ready' ? 0.6 : 0.95);
  },
  moveSelector: function () {
    this.selector.setPosition(this.cellX(this.cursor.c), this.cellY(this.cursor.r));
  },

  /* ------------------------------------------------------------ readout */
  updateReadout: function () {
    var b = this.battle;
    if (!b.tracing) {
      if (this.phase === 'idle') this.setSelector('ready');
      this.chainChip.root.setAlpha(0.35);
      this.dmgChip.root.setAlpha(0.35);
      this.chainChip.set('x1.00');
      this.dmgChip.set('0');
      return;
    }
    var p = b.preview();
    this.chainChip.root.setAlpha(1);
    this.dmgChip.root.setAlpha(1);
    this.chainChip.set('x' + p.chain.toFixed(2), p.runs > 1 ? '#F7C948' : '#F7FBFF');
    this.dmgChip.set(p.heal > 0 && p.damage === 0 ? ('+' + p.heal) : String(p.damage),
      p.damage > 0 ? '#FF9AA4' : '#9FB0CA');
    this.setSelector(p.runs > 0 ? 'preview' : 'invalid');
  },

  /* ------------------------------------------------------------- commit */
  commitTrace: function () {
    var self = this;
    var pre = this.battle.preview();
    if (pre.runs === 0) {
      this.battle.traceCancel();
      this.G.audio('invalid');
      this.setSelector('ready');
      this.paintPath();
      this.updateReadout();
      this.coachOnce('Runs need ' + this.battle.minRun + ' or more of the same orb to score.');
      return;
    }
    var rep = this.battle.commit();
    if (!rep.ok) { this.setSelector('ready'); this.paintPath(); this.updateReadout(); return; }
    this.busy = true;
    this.phase = 'resolve';
    this.setSelector('resolve');
    this.paintPath();
    this.updateReadout();
    this.playReport(rep);
    this.time.delayedCall(140, function () { self.setSelector('ready'); });
  },

  playReport: function (rep) {
    var self = this, L = this.L;
    var i;
    /* 1. pops */
    for (i = 0; i < rep.pops.length; i++) {
      (function (p, idx) {
        self.time.delayedCall(Math.min(240, idx * 22), function () {
          var img = self.orbMap[p.id];
          var x = self.cellX(p.c), y = self.cellY(p.r);
          if (img) {
            self.tweens.killTweensOf(img);
            self.tweens.add({
              targets: img, scaleX: 0, scaleY: 0, alpha: 0, duration: 130, ease: 'Cubic.easeIn',
              onComplete: function () { self.releaseOrbImg(img); }
            });
            delete self.orbMap[p.id];
          }
          self.fx.shards(x, y, KB.KI[p.t].face, 4);
          self.G.audio('pop', { rate: KB.clamp(0.9 + idx * 0.03, 0.85, 1.9), volume: 0.6 });
        });
      })(rep.pops[i], i);
    }

    /* 2. damage and healing */
    var tgt = this.enemyCards[rep.target];
    var delay = Math.min(260, rep.pops.length * 22) + 60;
    this.time.delayedCall(delay, function () {
      var totalDmg = 0, advantage = false;
      for (var k = 0; k < rep.runs.length; k++) {
        var run = rep.runs[k];
        if (run.heal > 0) {
          for (var f = 0; f < self.teamCards.length; f++) {
            self.fx.motes(self.teamCards[f].x, self.teamCards[f].y, 0xF7C948, 3);
          }
          self.G.audio('heal', { volume: 0.7 });
          self.floater('+' + run.heal, self.L.boardX + self.L.boardW / 2, self.L.teamY - 6, '#F7C948');
        }
        if (run.damage > 0) {
          totalDmg += run.damage;
          if (run.mult > 1) advantage = true;
          if (run.fighter >= 0) {
            var src = self.teamCards[run.fighter];
            self.fx.motes(src.x, src.y, KB.KI[run.t].edge, 3);
          }
        }
      }
      if (totalDmg > 0 && tgt) {
        var ang = Math.atan2(tgt.y - self.L.teamY, tgt.x - self.L.boardX - self.L.boardW / 2);
        self.fx.impact2(tgt.x, tgt.y + 20, ang - Math.PI, 90, advantage ? 0xF7C948 : 0xFF9AA4);
        self.fx.shards(tgt.x, tgt.y, advantage ? 0xF7C948 : 0xFF9AA4, advantage ? 6 : 4);
        self.floater('-' + totalDmg, tgt.x, tgt.y - 12, advantage ? '#F7C948' : '#FFFFFF');
        self.G.audio(advantage ? 'crit' : 'strike', { volume: 0.85 });
        self.kit.juice.hitStop(advantage ? 70 : 45);
        self.fx.kick(advantage ? 7 : 4, 160);
        self.shakeCard(tgt.root, 6);
        if (advantage) self.toastChip('Advantage', 'burst', 0xF7C948);
      }
      if (rep.chain >= 1.5) self.toastChip('Chain x' + rep.chain.toFixed(2), 'burst', 0xF7C948);
      for (var c = 0; c < rep.charged.length; c++) {
        if (!rep.charged[c].full) continue;
        var card = self.teamCards[rep.charged[c].slot];
        self.fx.ring(card.x, card.y, KB.KI[self.battle.team[rep.charged[c].slot].def.type].face, 2.2, 0.45);
        self.G.audio('charge_full');
        self.toastChip('Burst ready', 'burst', 0xF7C948);
        self.advanceTutorial('armed');
      }
      for (var kk = 0; kk < rep.kills.length; kk++) {
        var kc = self.enemyCards[rep.kills[kk]];
        if (!kc) continue;
        self.fx.ring(kc.x, kc.y, 0xFFFFFF, 2.6, 0.5);
        self.fx.shards(kc.x, kc.y, 0xF7FBFF, 8);
        self.G.audio('down');
      }
      self.refreshEnemies();
      self.refreshTeam();
    });

    /* 3. cascade */
    this.time.delayedCall(delay + 90, function () {
      for (var m = 0; m < rep.moves.length; m++) {
        var mv = rep.moves[m];
        var img = self.orbMap[mv.id];
        if (!img) continue;
        var dist = (mv.to - mv.from) * L.cell;
        self.fx.impact2(self.cellX(mv.c), self.cellY(mv.from), Math.PI / 2, dist, 0xFFFFFF);
        self.tweens.add({
          targets: img, y: self.cellY(mv.to),
          duration: 150 + Math.abs(mv.to - mv.from) * 26, ease: 'Back.easeOut'
        });
      }
      for (var s = 0; s < rep.spawns.length; s++) {
        var sp = rep.spawns[s];
        var img2 = self.takeOrbImg();
        img2.setTexture(KBArt.orbKey(sp.t, 'idle'));
        img2.__lit = false; img2.__type = sp.t;
        img2.setDisplaySize(L.cell * 0.94, L.cell * 0.94);
        img2.setPosition(self.cellX(sp.c), self.cellY(-1 - sp.order));
        self.orbMap[sp.id] = img2;
        self.tweens.add({
          targets: img2, y: self.cellY(sp.r),
          duration: 200 + sp.order * 24, ease: 'Back.easeOut', delay: 40 + sp.order * 20
        });
      }
      if (rep.pops.length) self.G.audio('cascade', { volume: 0.5 });
    });

    /* 4. enemy turn */
    this.time.delayedCall(delay + 380, function () {
      for (var a = 0; a < rep.enemyActions.length; a++) {
        var act = rep.enemyActions[a];
        var ec = self.enemyCards[act.slot];
        var fc = self.teamCards[act.target];
        if (ec) self.shakeCard(ec.root, 4);
        if (fc) {
          self.shakeCard(fc.root, 5);
          self.floater('-' + act.dmg, fc.x, fc.y - 16, '#FF9AA4');
          self.fx.shards(fc.x, fc.y, 0xF25C68, 4);
        }
        self.G.audio('hurt', { volume: 0.8 });
        self.fx.kick(5, 150);
      }
      self.refreshTeam();
      self.refreshEnemies();
    });

    /* 5. settle */
    this.time.delayedCall(delay + 620, function () {
      self.busy = false;
      self.phase = 'idle';
      self.syncBoard(false);
      self.paintPath();
      self.refreshAll();
      self.afterResolve(rep);
    });
  },

  afterResolve: function (rep) {
    var self = this;
    if (rep.ko) { this.endRun(false); return; }
    if (rep.stageCleared) { this.endRun(true); return; }
    if (rep.waveCleared) {
      this.buildEnemies();
      this.refreshAll();
      this.G.audio('wave');
      this.fx.confetti(this.L.W / 2, this.L.enemyTop + 40, this.L.W * 0.5, this.arc.accent);
      this.toastChip(this.mode === 'endless' ? ('Surge ' + (this.battle.wave + 1)) : 'Wave clear', 'chevron', 0xA8F0BB);
      if (this.mode === 'endless') {
        this.G.recordEndless(this.battle.score, this.battle.wave);
        this.refreshVerify();
      }
    }
    this.time.delayedCall(30, function () { self.refreshVerify(); });
  },

  /* --------------------------------------------------------- the burst */
  beginCutin: function (slot) {
    var self = this;
    var f = this.battle.team[slot];
    if (!f) return;
    this.burstSlot = slot;
    this.phase = 'cutin';
    this.busy = true;
    this.battle.traceCancel();
    this.paintPath();
    this.updateReadout();
    this.cutBadge.setTexture(KBArt.badgeKey(f.fid));
    KBUI.setText(this.cutName, f.def.name);
    KBUI.setText(this.cutMove, f.def.special.name);
    this.cutin.setVisible(true).setAlpha(0);
    this.skipBtn.root.setVisible(true);
    this.G.audio('super');
    var rm = !this.kit.juice.enabled;
    this.cutin.setScale(rm ? 1 : 0.9, 1);
    this.tweens.add({
      targets: this.cutin, alpha: 1, scaleX: 1, duration: rm ? 120 : 240, ease: 'Back.easeOut'
    });
    if (!rm) {
      this.fx.ring(this.L.W * 0.24, this.L.H * 0.34, KB.KI[f.def.type].face, 3.4, 0.6);
      this.fx.motes(this.L.W * 0.24, this.L.H * 0.34, KB.KI[f.def.type].edge, 6);
      this.fx.kick(6, 200);
    }
    this.cutTimer = this.time.delayedCall(rm ? 500 : 950, function () { self.startClash(); });
    this.advanceTutorial('burst');
  },

  skipCutin: function () {
    if (this.phase !== 'cutin') return;
    if (this.cutTimer) { this.cutTimer.remove(false); this.cutTimer = null; }
    this.startClash();
  },

  startClash: function () {
    if (this.phase === 'clash') return;
    this.phase = 'clash';
    this.clashT = 0;
    this.clashDur = this.battle.clashWindow(this.burstSlot);
    this.clashBox.setVisible(true).setAlpha(1);
    this.clashMark.setX(-this.clashW / 2 + 8);
    this.skipBtn.root.setVisible(false);
  },

  clashQuality: function () {
    /* marker sweeps left to right once; the gold zone is the centre 22% */
    var k = KB.clamp(this.clashT / this.clashDur, 0, 1);
    var d = Math.abs(k - 0.5) / 0.5;
    return KB.clamp(1 - d * 1.15, 0, 1);
  },

  resolveClash: function () {
    var self = this;
    if (this.phase !== 'clash') return;
    var q = this.clashQuality();
    this.phase = 'resolve';
    this.clashBox.setVisible(false);
    var rep = this.battle.burst(this.burstSlot, q);
    var mult = this.battle.clashMult(q);
    this.tweens.add({
      targets: this.cutin, alpha: 0, duration: 180,
      onComplete: function () { self.cutin.setVisible(false); }
    });
    this.G.audio(q >= 0.86 ? 'clash_hit' : 'strike');
    if (q >= 0.86) this.toastChip('Perfect clash x' + mult.toFixed(2), 'burst', 0xF7C948);
    else this.toastChip('Clash x' + mult.toFixed(2), 'burst', 0xA8F0BB);

    for (var i = 0; i < rep.hits.length; i++) {
      (function (hit, idx) {
        self.time.delayedCall(80 + idx * 90, function () {
          var card = self.enemyCards[hit.slot];
          if (!card) return;
          self.fx.ring(card.x, card.y, KB.KI[self.battle.team[self.burstSlot].def.type].face, 2.8, 0.45);
          self.fx.shards(card.x, card.y, 0xFFFFFF, 8);
          self.fx.impact2(card.x, card.y + 26, -Math.PI / 2, 110, 0xFFFFFF);
          self.floater('-' + hit.dmg, card.x, card.y - 14, hit.mult > 1 ? '#F7C948' : '#FFFFFF');
          self.shakeCard(card.root, 8);
          self.G.audio(hit.killed ? 'down' : 'crit', { volume: 0.9 });
          self.kit.juice.hitStop(70);
          self.fx.kick(9, 220);
          self.refreshEnemies();
        });
      })(rep.hits[i], i);
    }
    if (rep.heal > 0) {
      for (var t = 0; t < this.teamCards.length; t++) this.fx.motes(this.teamCards[t].x, this.teamCards[t].y, 0xF7C948, 3);
      this.G.audio('heal');
    }
    if (rep.selfDamage > 0) {
      var sc = this.teamCards[this.burstSlot];
      this.floater('-' + rep.selfDamage, sc.x, sc.y - 16, '#FF9AA4');
    }
    var settle = 260 + rep.hits.length * 90;
    this.time.delayedCall(settle, function () {
      self.busy = false;
      self.phase = 'idle';
      self.refreshAll();
      self.refreshVerify();
      if (rep.ko) { self.endRun(false); return; }
      if (rep.stageCleared) { self.endRun(true); return; }
      if (rep.waveCleared) {
        self.buildEnemies();
        self.refreshAll();
        self.G.audio('wave');
        self.toastChip('Wave clear', 'chevron', 0xA8F0BB);
        if (self.mode === 'endless') self.G.recordEndless(self.battle.score, self.battle.wave);
      }
    });
  },

  /* ------------------------------------------------------------ visuals */
  shakeCard: function (obj, mag) {
    if (!this.kit.juice.enabled) return;
    var x0 = obj.x;
    this.tweens.killTweensOf(obj);
    this.tweens.add({
      targets: obj, x: x0 + mag, duration: 45, yoyo: true, repeat: 1,
      onComplete: function () { obj.x = x0; }
    });
  },

  floater: function (text, x, y, color) {
    var f = this.floaters[this.floatNext];
    this.floatNext = (this.floatNext + 1) % this.floaters.length;
    KBUI.setText(f.t, text);
    KBUI.setColor(f.t, color || '#FFFFFF');
    f.t.setPosition(x, y).setVisible(true).setAlpha(1).setScale(this.kit.juice.enabled ? 0.7 : 1);
    this.tweens.killTweensOf(f.t);
    this.tweens.add({
      targets: f.t, y: y - 34, alpha: 0, scaleX: 1, scaleY: 1,
      duration: 620, ease: 'Cubic.easeOut',
      onComplete: function () { f.t.setVisible(false); }
    });
  },

  toastChip: function (text, icon, tint) {
    this.toast.chip(text, {
      icon: icon, tint: tint, hold: 700,
      x: this.L.W / 2, y: this.L.teamY - 30
    });
  },

  /* ------------------------------------------------------------ refresh */
  refreshAll: function () {
    this.refreshEnemies();
    this.refreshTeam();
    this.refreshHud();
  },

  refreshHud: function () {
    var b = this.battle;
    KBUI.setText(this.turnChip.value, String(b.turn));
    var sub;
    if (this.mode === 'endless') sub = 'Surge ' + (b.wave + 1) + '   ' + b.score;
    else if (this.mode === 'trial') sub = 'Wave ' + (b.waveIndex + 1) + ' of ' + b.waves.length;
    else sub = this.arc.name + '   wave ' + (b.waveIndex + 1) + ' of ' + b.waves.length;
    KBUI.setText(this.subText, sub);
  },

  refreshEnemies: function () {
    var b = this.battle;
    for (var i = 0; i < this.enemyCards.length; i++) {
      var card = this.enemyCards[i];
      var e = b.enemies[i];
      if (!e) continue;
      card.hp.set(e.maxHp > 0 ? e.hp / e.maxHp : 0);
      KBUI.setText(card.hpText, e.alive ? (e.hp + ' / ' + e.maxHp) : 'Down');
      KBUI.setColor(card.hpText, e.alive ? '#DCE6F5' : '#7C8CA8');
      var soon = e.alive && e.timer <= 1;
      KBUI.setText(card.tg, e.alive ? (e.timer + 'T  ' + e.telegraph) : '');
      KBUI.setColor(card.tg, soon ? '#FF9AA4' : '#F7C948');
      card.sel.setVisible(e.alive && b.target === i);
      card.root.setAlpha(e.alive ? 1 : 0.42);
      KBUI.setAlpha(card.portrait, e.alive ? 1 : 0.4);
    }
  },

  refreshTeam: function () {
    var b = this.battle;
    for (var i = 0; i < this.teamCards.length; i++) {
      var card = this.teamCards[i];
      var f = b.team[i];
      card.hp.set(f.maxHp > 0 ? f.hp / f.maxHp : 0);
      card.hp.tint(f.down ? 0x5C6478 : (f.hp / f.maxHp < 0.3 ? 0xF25C68 : 0x5BCB77));
      var cap = b.chargeCap(f);
      card.charge.set(cap > 0 ? f.charge / cap : 0);
      var armed = f.charge >= KB.M.fullCharge && !f.down;
      card.armIcon.setVisible(armed);
      KBUI.setText(card.chgText, f.down ? 'Down' : (armed ? 'Burst' : Math.round(f.charge) + '%'));
      KBUI.setColor(card.chgText, f.down ? '#7C8CA8' : (armed ? '#F7C948' : '#9FB0CA'));
      card.front.setVisible(b.front === i && !f.down);
      card.root.setAlpha(f.down ? 0.45 : 1);
      if (armed && this.kit.juice.enabled && !card.__pulse) {
        card.__pulse = this.tweens.add({
          targets: card.badge, scaleX: card.badge.scaleX * 1.12, scaleY: card.badge.scaleY * 1.12,
          duration: 520, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });
      } else if (!armed && card.__pulse) {
        card.__pulse.stop();
        card.__pulse = null;
        card.badge.setDisplaySize(34, 34);
      }
    }
  },

  /* ---------------------------------------------------------- tutorial */
  TUT: [
    { key: 'trace', msg: 'Drag through three or more matching orbs.' },
    { key: 'armed', msg: 'Longer chains raise the multiplier.' },
    { key: 'target', msg: 'Tap an enemy card to switch target.' },
    { key: 'burst', msg: 'Tap a Burst card, then tap the gold zone.' }
  ],
  showTutorial: function () {
    if (this.tutorialStep < 0 || this.tutorialStep >= this.TUT.length) return;
    this.coach.show(this.TUT[this.tutorialStep].msg,
      this.L.W / 2, this.L.hudY + 40, Math.min(this.L.W - 20, 360));
  },
  advanceTutorial: function (key) {
    if (this.tutorialStep < 0 || this.tutorialStep >= this.TUT.length) return;
    if (this.TUT[this.tutorialStep].key !== key) return;
    this.tutorialStep++;
    if (this.tutorialStep >= this.TUT.length) { this.coach.hide(); return; }
    var self = this;
    this.time.delayedCall(700, function () { self.showTutorial(); });
  },
  coachOnce: function (msg) {
    this.coach.show(msg, this.L.W / 2, this.L.hudY + 40, Math.min(this.L.W - 20, 360));
  },

  /* --------------------------------------------------------------- end */
  endRun: function (won) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.busy = true;
    this.resultOpen = true;
    var G = this.G, self = this;
    var payload = {
      mode: this.mode, stage: this.stageIndex, trial: this.trialIndex,
      won: won, turns: this.battle.turn, score: this.battle.score,
      wave: this.battle.wave, damage: this.battle.damageDone, reward: null
    };
    if (won) {
      this.G.audio('victory');
      this.fx.confetti(this.L.W / 2, this.L.H * 0.3, this.L.W * 0.7, this.arc.accent);
      this.fx.ring(this.L.W / 2, this.L.H * 0.34, 0xFFFFFF, 5, 0.8);
      payload.reward = G.recordWin(this.mode, this.mode === 'trial' ? this.trialIndex : this.stageIndex,
        this.battle.turn, this.battle.score);
    } else {
      this.G.audio('defeat');
      if (this.mode === 'endless') G.recordEndless(this.battle.score, this.battle.wave);
    }
    this.toast.clear();
    this.toast.banner(won ? 'Stage clear' : 'Team down', {
      sub: won ? (this.battle.turn + ' turns') : 'The road is still there',
      color: won ? '#A8F0BB' : '#FF9AA4', hold: 700, y: this.L.H * 0.36,
      onDone: function () { self.scene.start('result', payload); }
    });
    this.refreshVerify();
  },

  /* ------------------------------------------------------------- pause */
  openPause: function () {
    var self = this;
    this.G.openPause({
      onRestart: function () { self.scene.restart(self.restartData()); },
      onQuit: function () { self.scene.start(self.mode === 'trial' ? 'trials' : (self.mode === 'endless' ? 'menu' : 'map')); }
    });
  },

  /* ------------------------------------------------------- verify hook */
  refreshVerify: function () {
    var v = this.G.verify;
    var s = this.battle.snapshot();
    v.scene = 'play';
    v.mode = this.mode;
    v.stage = this.stageIndex;
    v.trial = this.trialIndex;
    v.turn = s.turn;
    v.wave = s.wave;
    v.hp = s.hp;
    v.score = s.score;
    v.over = s.over;
    v.won = s.won;
    v.enemies = s.enemies.length;
    v.alive = 0;
    for (var i = 0; i < s.enemies.length; i++) if (s.enemies[i].alive) v.alive++;
    v.fx = this.fx ? this.fx.stats() : null;
    v.phase = this.phase;
  },

  restart: function () {
    this.scene.restart(this.restartData());
  },

  /* ------------------------------------------------------------ update */
  update: function (time, delta) {
    if (this.kit.paused) return;
    var jf = this.kit.juice.frame();
    var dt = Math.min(delta, 50) / 1000;
    this.fx.update(dt);
    if (this.bg) this.bg.update(dt);

    /* the world offset carries shake and frame nudge together */
    var ox = jf.dx + this.fx.nudge.x, oy = jf.dy + this.fx.nudge.y;
    this.world.setPosition(ox, oy);

    /* a frozen frame never advances any clock the sim can read */
    if (jf.frozen) return;

    if (this.phase === 'clash') {
      this.clashT += dt;
      var k = KB.clamp(this.clashT / this.clashDur, 0, 1);
      this.clashMark.setX(-this.clashW / 2 + 8 + k * (this.clashW - 16));
      if (this.clashT >= this.clashDur) this.resolveClash();
      return;
    }

    if (this.battle.tracing) {
      if (this.battle.tickTrace(dt)) this.commitTrace();
      else {
        var frac = this.battle.traceT / this.battle.traceLimit();
        KBUI.setAlpha(this.selector, 0.65 + 0.3 * Math.abs(Math.sin(time / 150)));
        if (frac < 0.25) this.selector.setAngle(Math.sin(time / 60) * 4);
        else this.selector.setAngle(0);
      }
      this.moveSelector();
    } else if (this.phase === 'idle') {
      /* Ready state: the selector breathes on the last touched cell */
      this.selPulse += dt;
      var s = 1 + (this.kit.juice.enabled ? Math.sin(this.selPulse * 2.2) * 0.04 : 0);
      this.selector.setDisplaySize(this.L.cell * 1.18 * s, this.L.cell * 1.18 * s);
      this.moveSelector();
    }
  }
});
