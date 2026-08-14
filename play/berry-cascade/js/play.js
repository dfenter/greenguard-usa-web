/* Berry Cascade - the grove board scene.
 * View only: it reads sim edges returned by BC.* calls and animates them.
 * It never mutates sim arrays outside the sanctioned BC entry points and
 * never advances a clock the stepped resolution has not reached.
 */
var PlayScene = new Phaser.Class({
  Extends: Phaser.Scene,

  initialize: function PlayScene() {
    Phaser.Scene.call(this, { key: 'play' });
  },

  /* ------------------------------------------------------------- setup */
  init: function (data) {
    data = data || {};
    this.mode = (data.mode === 'endless' || data.mode === 'gauntlet') ? data.mode : 'trail';
    this.groveIndex = BC.clamp(data.n | 0, 0, BC.GROVE_COUNT - 1);
    this.gauntletIndex = BC.clamp(data.gi | 0, 0, BC.GAUNTLET.length - 1);
    this.busy = true;
    this.over = false;
  },

  create: function () {
    var G = window.BCGame;
    this.kit = G.kit;
    this.gameRef = G;

    this.bgLayer = this.add.container(0, 0).setDepth(0);
    this.boardLayer = this.add.container(0, 0).setDepth(10);
    this.pieceLayer = this.add.container(0, 0).setDepth(12);
    this.fxLayer = this.add.container(0, 0).setDepth(20);
    this.hudLayer = this.add.container(0, 0).setDepth(40);
    this.overLayer = this.add.container(0, 0).setDepth(70);

    this.sky = this.add.image(0, 0, 'bc_px').setOrigin(0, 0);
    this.bgLayer.add(this.sky);
    this.buildMotes();
    this.boardImg = this.add.image(0, 0, 'bc_px').setOrigin(0, 0);
    this.boardLayer.add(this.boardImg);

    this.fx = BCFx.create(this, this.fxLayer, this.kit);

    var self = this;
    this.toast = BCUI.transients(this, this.overLayer, {
      isLive: function () { return !self.over && !self.busyOverlay; },
      reduced: function () { return !self.kit.juice.enabled; }
    });
    this.coach = BCUI.coach(this, this.overLayer);

    this.buildCells();
    this.buildSelector();
    this.buildHud();
    this.buildResult();

    this.gestures = {};
    this.prevKeys = {};
    this.bindGestures();
    this.cursor = 27;
    this.selected = -1;
    this.hintAt = 0;

    this.scale.on('resize', this.relayout, this);
    this.events.once('shutdown', function () {
      self.scale.off('resize', self.relayout, self);
    });

    this.startLevel();
    this.relayout();
  },

  /* ---------------------------------------------------------- geometry */
  computeLayout: function () {
    var W = this.scale.width, H = this.scale.height;
    var ins = BCUI.insets();
    var top = ins.top, bot = ins.bottom;
    var hudH = 48, barH = 62, gap = 8;
    var availW = W - 12 - ins.left - ins.right;
    var availH = H - top - bot - hudH - barH - gap * 3;
    var pad = 11;
    var cell = Math.floor(Math.min((availW - pad * 2) / BC.W, (availH - pad * 2) / BC.H));
    cell = BC.clamp(cell, 24, 72);
    var bw = BC.W * cell + pad * 2, bh = BC.H * cell + pad * 2;
    var bx = Math.round((W - bw) / 2);
    var topOfBoardZone = top + hudH + gap * 2;
    var zoneH = H - bot - barH - gap - topOfBoardZone;
    /* bias the board down the free band: the playfield stays inside thumb
     * reach while the HUD keeps clear air under it */
    var by = Math.round(topOfBoardZone + Math.max(0, (zoneH - bh) * 0.72));
    return {
      W: W, H: H, ins: ins, cell: cell, pad: pad, bw: bw, bh: bh, bx: bx, by: by,
      hudY: top + gap + hudH / 2, hudH: hudH,
      barY: H - bot - 40, barH: barH,
      coachY: Math.round(topOfBoardZone + 26)
    };
  },

  relayout: function () {
    var L = this.computeLayout();
    this.L = L;
    var segKey = 'bc_sky_' + this.seg.id + '_' + Math.round(L.W) + 'x' + Math.round(L.H);
    if (!this.textures.exists(segKey)) BCArt.bakeSky(this, segKey, L.W, L.H, this.seg);
    this.sky.setTexture(segKey).setPosition(0, 0).setDisplaySize(L.W, L.H);

    var boardKey = 'bc_board_' + this.seg.id + '_' + L.cell;
    if (!this.textures.exists(boardKey)) {
      BCArt.bakeBoard(this, boardKey, L.cell, L.pad, BC.W, BC.H, this.seg);
    }
    this.boardImg.setTexture(boardKey).setPosition(L.bx, L.by);
    /* Pieces refill from above the top row: clip them to the inner well so a
     * falling berry never draws over the frame, the HUD or the grove name. */
    if (!this.wellMask) this.wellMask = this.make.graphics({ add: false });
    this.wellMask.clear();
    this.wellMask.fillStyle(0xffffff, 1);
    this.wellMask.fillRoundedRect(L.bx + L.pad - 4, L.by + L.pad - 4,
      BC.W * L.cell + 8, BC.H * L.cell + 8, 10);
    if (!this.pieceLayer.mask) this.pieceLayer.setMask(this.wellMask.createGeometryMask());
    this.boardLayer.setPosition(0, 0);
    this.pieceLayer.setPosition(L.bx + L.pad, L.by + L.pad);
    this.fxLayer.setPosition(L.bx + L.pad, L.by + L.pad);

    var i, x, y;
    for (i = 0; i < BC.W * BC.H; i++) {
      var v = this.cells[i];
      x = (i % BC.W) * L.cell + L.cell / 2;
      y = ((i / BC.W) | 0) * L.cell + L.cell / 2;
      v.bx = x; v.by = y;
      v.img.setPosition(x, y);
      v.img.setDisplaySize(L.cell, L.cell);
      v.syr.setPosition(x, y);
      v.syr.setDisplaySize(L.cell, L.cell);
    }
    this.sel.ring.setDisplaySize(L.cell, L.cell);
    this.sel.ghost.setDisplaySize(L.cell, L.cell);
    this.sel.arrow.setDisplaySize(L.cell * 0.5, L.cell * 0.5);
    this.sel.resolve.setDisplaySize(L.cell, L.cell);

    this.layoutHud(L);
    this.layoutResult(L);
    this.resetMotes();
    this.syncCells();
    if (this.tutorial && this.tutorial.phase === 'swap') {
      this.setSelected(this.tutorial.move[0], 'ready');
      this.showPreview(this.tutorial.move[0], this.tutorial.move[1], true);
    }
  },

  /* Signature per-segment ambience: a small pool of drifting motes behind the
   * board. Leaves in the orchard, syrup bubbles in the marsh, spores in the
   * forest, embers in the thicket, petals at the summit. Cosmetic only. */
  buildMotes: function () {
    this.motes = [];
    for (var i = 0; i < 8; i++) {
      var img = this.add.image(0, 0, 'bc_dot');
      img.setVisible(false);
      this.bgLayer.add(img);
      this.motes.push({ img: img, x: 0, y: 0, vx: 0, vy: 0, sp: 0, r: 0, spin: 0, a: 0 });
    }
    this.moteRnd = BC.rng(0x1EAF);
  },

  resetMotes: function () {
    if (!this.motes || !this.L) return;
    var seg = this.seg, m, i;
    var kind = seg.motif || 'leaf';
    var key = (kind === 'bubble' || kind === 'spore') ? 'bc_dot' : 'bc_shard';
    var tint = kind === 'bubble' ? 0xFFD79A : (kind === 'spore' ? 0xCFF3D8 : seg.accent);
    for (i = 0; i < this.motes.length; i++) {
      m = this.motes[i];
      m.img.setTexture(key).setTint(tint);
      m.img.setVisible(true);
      m.x = this.moteRnd() * this.L.W;
      m.y = this.moteRnd() * this.L.H;
      m.sp = 8 + this.moteRnd() * 16;
      m.vx = (this.moteRnd() - 0.5) * 12;
      m.vy = (kind === 'bubble') ? -m.sp : m.sp * 0.7;
      m.r = this.moteRnd() * 6.28;
      m.spin = (this.moteRnd() - 0.5) * 0.8;
      m.a = 0.10 + this.moteRnd() * 0.16;
      var sz = 6 + this.moteRnd() * 12;
      m.img.setDisplaySize(sz, sz).setAlpha(m.a);
      m.img.setRotation(m.r);
      m.img.setPosition(m.x, m.y);
    }
  },

  updateMotes: function (dt) {
    if (!this.motes || !this.L) return;
    if (!this.kit.juice.enabled) return;      /* reduced motion: motes hold still */
    var k = 1;
    for (var i = 0; i < this.motes.length; i++) {
      var m = this.motes[i];
      if (!m.img.visible) continue;
      m.x += m.vx * dt * k; m.y += m.vy * dt * k;
      m.r += m.spin * dt * k;
      if (m.y > this.L.H + 20) m.y = -20;
      if (m.y < -20) m.y = this.L.H + 20;
      if (m.x > this.L.W + 20) m.x = -20;
      if (m.x < -20) m.x = this.L.W + 20;
      m.img.setPosition(m.x, m.y);
      m.img.setRotation(m.r);
    }
  },

  /* ------------------------------------------------------- board sprites */
  buildCells: function () {
    this.cells = [];
    for (var i = 0; i < BC.W * BC.H; i++) {
      var syr = this.add.image(0, 0, 'bc_syr1').setVisible(false);
      var img = this.add.image(0, 0, 'bc_b0_0');
      this.pieceLayer.add(img);
      /* Syrup is a readable goal overlay, not a hidden board layer. */
      this.pieceLayer.add(syr);
      this.cells.push({ img: img, syr: syr, bx: 0, by: 0, key: '', syrKey: '' });
    }
  },

  buildSelector: function () {
    var ring = this.add.image(0, 0, 'bc_focus').setVisible(false);
    var ghost = this.add.image(0, 0, 'bc_ghost_ok').setVisible(false);
    var arrow = this.add.image(0, 0, 'bc_arrow').setVisible(false);
    var resolve = this.add.image(0, 0, 'bc_focus').setVisible(false);
    this.pieceLayer.add(ghost);
    this.pieceLayer.add(ring);
    this.pieceLayer.add(arrow);
    this.pieceLayer.add(resolve);
    this.sel = { ring: ring, ghost: ghost, arrow: arrow, resolve: resolve,
      resolveCell: -1, state: 'ready', t: 0 };
  },

  syncCells: function () {
    var b = this.board, i, v, key, c, sp;
    if (!b) return;
    for (i = 0; i < b.n; i++) {
      v = this.cells[i];
      c = b.c[i]; sp = b.sp[i];
      if (c === BC.EMPTY) {
        if (v.key !== 'none') { v.key = 'none'; v.img.setVisible(false); }
      } else {
        key = BCArt.berryKey(c, sp);
        if (v.key !== key) {
          v.key = key;
          v.img.setTexture(key).setVisible(true);
          v.img.setDisplaySize(this.L ? this.L.cell : 44, this.L ? this.L.cell : 44);
        } else if (!v.img.visible) {
          v.img.setVisible(true);
        }
        v.img.setAlpha(1);
        v.img.setScale(v.img.scaleX, v.img.scaleY);
      }
      var sk = b.syr[i] > 1 ? 'bc_syr2' : (b.syr[i] === 1 ? 'bc_syr1' : '');
      if (v.syrKey !== sk) {
        v.syrKey = sk;
        if (sk) {
          v.syr.setTexture(sk).setVisible(true);
          v.syr.setDisplaySize(this.L ? this.L.cell : 44, this.L ? this.L.cell : 44);
          v.syr.setAlpha(1);
        } else {
          v.syr.setVisible(false);
        }
      }
    }
  },

  resetCellTransforms: function () {
    var L = this.L, i, v;
    if (!L) return;
    for (i = 0; i < this.cells.length; i++) {
      v = this.cells[i];
      this.tweens.killTweensOf(v.img);
      v.img.setPosition(v.bx, v.by);
      v.img.setDisplaySize(L.cell, L.cell);
      v.img.setAlpha(1);
      v.img.setAngle(0);
    }
  },

  /* ---------------------------------------------------------------- HUD */
  buildHud: function () {
    var self = this;
    this.hudChips = {};
    this.hudChips.moves = BCUI.chip(this, { icon: 'moves', value: '0', w: 70, h: 40, size: 19, tint: 0xF7FBFF });
    this.hudChips.score = BCUI.chip(this, { icon: 'score', value: '0', w: 92, h: 40, size: 15, tint: 0xF7C948, meter: true });
    this.hudChips.syrup = BCUI.chip(this, { icon: 'syrup', value: '0', w: 64, h: 40, size: 14, tint: 0xF29A4A, meter: true });
    this.hudChips.acorn = BCUI.chip(this, { icon: 'acorn', value: '0', w: 64, h: 40, size: 14, tint: 0xC99461, meter: true });
    var k;
    for (k in this.hudChips) this.hudLayer.add(this.hudChips[k].root);

    this.btnSettings = BCUI.button(this, {
      icon: 'gear', size: 40, fill: 0x1C2A46,
      onPress: function () { self.openSettings(); }
    });
    this.hudLayer.add(this.btnSettings.root);

    this.btnMap = BCUI.button(this, {
      icon: 'map', size: 48, fill: 0x2E4269,
      onPress: function () { self.leave(); }
    });
    this.btnRestart = BCUI.button(this, {
      icon: 'restart', size: 48, fill: 0x2E4269,
      onPress: function () { self.restart(); }
    });
    this.hudLayer.add(this.btnMap.root);
    this.hudLayer.add(this.btnRestart.root);

    this.nameText = BCUI.text(this, 0, 0, '', 13, 650, '#C9D4E4');
    this.nameText.setAlpha(0.85);
    this.hudLayer.add(this.nameText);
  },

  layoutHud: function (L) {
    var y = L.hudY;
    var left = L.ins.left + 8, right = L.W - L.ins.right - 8;
    var chips = [this.hudChips.moves];
    if (this.lv && this.lv.target > 0) chips.push(this.hudChips.score);
    if (this.lv && this.lv.syrupTotal > 0) chips.push(this.hudChips.syrup);
    if (this.lv && this.lv.acorns > 0) chips.push(this.hudChips.acorn);
    if (this.mode === 'endless') chips = [this.hudChips.moves, this.hudChips.score];

    var k;
    for (k in this.hudChips) this.hudChips[k].root.setVisible(false);

    this.btnSettings.root.setPosition(right - 20, y);
    var usable = (right - 46) - left;
    var total = 0, i;
    for (i = 0; i < chips.length; i++) total += chips[i].root.list[0].displayWidth;
    /* never let the goal row run under the settings button: shrink the whole
     * cluster uniformly instead, with a floor that keeps text readable */
    var minGap = 4;
    var need = total + minGap * Math.max(0, chips.length - 1);
    var k = need > usable ? Math.max(0.86, usable / need) : 1;
    var gap = chips.length > 1 ? Math.max(minGap, Math.min(10, (usable - total * k) / (chips.length - 1))) : 0;
    var x = left;
    for (i = 0; i < chips.length; i++) {
      var w = chips[i].root.list[0].displayWidth * k;
      chips[i].root.setVisible(true).setScale(k).setPosition(x + w / 2, y);
      x += w + gap;
    }

    this.nameText.setPosition(L.W / 2, L.by - 12);
    this.nameText.setVisible(L.by - 12 > L.hudY + 24);

    this.btnMap.root.setPosition(L.ins.left + 36, L.barY);
    this.btnRestart.root.setPosition(L.W - L.ins.right - 36, L.barY);
  },

  shortScore: function (v) {
    if (v < 10000) return String(v);
    if (v < 1000000) return (Math.floor(v / 100) / 10).toFixed(1) + 'k';
    return (Math.floor(v / 100000) / 10).toFixed(1) + 'm';
  },

  updateHud: function () {
    if (!this.lv || !this.st) return;
    var st = this.st, lv = this.lv;
    var mv = Math.max(0, st.moves);
    this.hudChips.moves.set(String(mv), 0, mv <= 3 ? '#F25C68' : (mv <= 6 ? '#F7C948' : '#F7FBFF'));

    if (this.mode === 'endless') {
      this.hudChips.score.set(this.shortScore(st.score), 0);
    } else {
      if (lv.target > 0) {
        this.hudChips.score.set(this.shortScore(st.score), st.score / lv.target);
        this.hudChips.score.setDone(st.score >= lv.target);
      }
      if (lv.syrupTotal > 0) {
        this.hudChips.syrup.set(Math.min(st.syrup, lv.syrupTotal) + '/' + lv.syrupTotal, st.syrup / lv.syrupTotal);
        this.hudChips.syrup.setDone(st.syrup >= lv.syrupTotal);
      }
      if (lv.acorns > 0) {
        this.hudChips.acorn.set(Math.min(st.acorns, lv.acorns) + '/' + lv.acorns, st.acorns / lv.acorns);
        this.hudChips.acorn.setDone(st.acorns >= lv.acorns);
      }
    }
  },

  /* ------------------------------------------------------------ level */
  startLevel: function () {
    var save = this.gameRef.save;
    if (this.mode === 'endless') {
      this.endlessStage = 0;
      this.lv = BC.buildEndless(0, (Date.now() & 0x7fffffff));
    } else if (this.mode === 'gauntlet') {
      this.lv = BC.buildGauntlet(this.gauntletIndex);
    } else {
      this.lv = BC.buildGrove(this.groveIndex);
    }
    this.seg = BC.segmentById(this.lv.seg);
    var init = BC.initBoardFor(this.lv);
    this.board = init.board;
    this.rand = init.rand;
    this.st = BC.newState(this.lv);
    this.over = false;
    this.busy = false;
    this.busyOverlay = false;
    this.selected = -1;
    this.chain = 0;
    this.gestures = {};
    if (this.gest) this.gest.clear();

    this.fx.reset();
    this.toast.clear();
    if (this.resultBox) this.resultBox.setVisible(false);
    this.resetCellTransforms();
    this.syncCells();
    this.updateSelector();

    var music = (this.seg.id === 'summit' || this.mode === 'gauntlet') ? 'theme_summit' : 'theme_grove';
    this.gameRef.music(music);

    var title = this.mode === 'endless' ? 'Endless Cascade' : this.lv.name;
    BCUI.setText(this.nameText, title + '  ·  ' + this.seg.name);

    /* coach strip: one thin line, top edge, fades. Never during a cascade. */
    var tut = save.tut | 0;
    this.tutorial = null;
    this.lessonToSet = 0;
    if (this.mode === 'trail' && this.groveIndex === 0 && tut < 1) {
      var first = null, guidedMoves = BC.listMoves(this.board), gm;
      /* Prefer a plain three-cell clear over a starter special so the first
       * lesson demonstrates the whole match, fall and refill loop. */
      for (gm = 0; gm < guidedMoves.length && !first; gm++) {
        var candidate = guidedMoves[gm];
        if (this.board.sp[candidate[0]] !== BC.SP.NONE || this.board.sp[candidate[1]] !== BC.SP.NONE) continue;
        var probe = BC.cloneBoard(this.board);
        BC.doSwap(probe, candidate[0], candidate[1]);
        var previewStep = BC.swapClear(probe, candidate[0], candidate[1], BC.rng(this.lv.seed ^ 0xC0DE));
        if (previewStep && previewStep.cells.length === 3) first = candidate;
      }
      if (!first) first = BC.firstMove(this.board);
      if (first) {
        this.tutorial = { move: first, phase: 'swap' };
        this.showCoach('Follow the arrow. Make a match of 3, then watch the berries fall.');
      }
    } else if (this.mode === 'trail' && this.groveIndex === 2 && tut < 2) {
      this.showCoach('Match 4 in a row to grow a line berry.');
      this.lessonToSet = 2;
    } else if (this.mode === 'trail' && this.groveIndex === 5 && tut < 3) {
      this.showCoach('Swap two specials together for a combo.');
      this.lessonToSet = 3;
    } else if (this.mode === 'gauntlet' && !save.seenGauntlet) {
      this.showCoach('Gauntlet groves are tight. Medals need combos.');
      this.lessonToSet = 4;
    }
    this.updateHud();
    this.refreshVerify();
    this.hintAt = this.time.now + 9000;
  },

  showCoach: function (msg) {
    var L = this.L || this.computeLayout();
    this.coach.show(msg, L.W / 2, L.coachY, Math.min(L.W - 16, 360));
  },

  restart: function () {
    this.kit.input.clearAll();
    this.tweens.killAll();
    this.time.removeAllEvents();
    this.startLevel();
    this.relayout();
  },

  leave: function () {
    this.kit.input.clearAll();
    this.gameRef.audio('ui_click');
    if (this.mode === 'gauntlet') this.scene.start('gauntlet');
    else if (this.mode === 'endless') this.scene.start('menu');
    else this.scene.start('trail', { focus: this.groveIndex });
  },

  openSettings: function () {
    var self = this;
    this.gameRef.audio('ui_click');
    this.kit.openSettings([function (box, row) {
      row('Hint arrow', function () { return self.gameRef.prefs.hints !== false; },
        function (v) { self.gameRef.prefs.hints = v; self.gameRef.persistPrefs(); });
    }]);
  },

  /* ------------------------------------------------------------ input */
  cellAt: function (px, py) {
    var L = this.L;
    if (!L) return -1;
    var x = Math.floor((px - (L.bx + L.pad)) / L.cell);
    var y = Math.floor((py - (L.by + L.pad)) / L.cell);
    if (x < 0 || y < 0 || x >= BC.W || y >= BC.H) return -1;
    return y * BC.W + x;
  },

  bindGestures: function () {
    var self = this;
    this.gest = BCUI.gestures(this, this.kit, {
      onDown: function (id, x, y) {
        if (self.over || self.busyOverlay || !self.L || !self.board) return;
        var idx = self.cellAt(x, y);
        /* remember the selection AS IT WAS at claim time: the down press
         * itself moves the focus ring, so release must not read it back */
        self.gestures[id] = { cell: idx, sx: x, sy: y, fired: false, had: self.selected };
        if (idx >= 0 && !self.busy) self.setSelected(idx, 'ready');
      },
      onMove: function (id, x, y) {
        var g = self.gestures[id];
        if (!g || g.fired || g.cell < 0 || self.busy || self.over) return;
        var dx = x - g.sx, dy = y - g.sy;
        var thresh = self.L.cell * 0.36;
        if (Math.abs(dx) < thresh && Math.abs(dy) < thresh) return;
        g.fired = true;
        var j, col = g.cell % BC.W;
        if (Math.abs(dx) > Math.abs(dy)) {
          if ((col === 0 && dx < 0) || (col === BC.W - 1 && dx > 0)) j = -1;
          else j = g.cell + (dx > 0 ? 1 : -1);
        } else {
          j = g.cell + (dy > 0 ? BC.W : -BC.W);
        }
        if (j >= 0 && j < self.board.n) self.tryMove(g.cell, j);
        else self.denyAt(g.cell);
      },
      onUp: function (id, x, y) {
        var g = self.gestures[id];
        delete self.gestures[id];
        if (!g || g.fired || g.cell < 0 || self.busy || self.over || self.busyOverlay) return;
        if (g.had >= 0 && g.had !== g.cell && self.adjacent(g.had, g.cell)) {
          self.tryMove(g.had, g.cell);
        } else if (g.had === g.cell) {
          self.setSelected(-1, 'ready');                 /* tap-tap the same berry clears it */
        } else {
          self.setSelected(g.cell, 'ready');
          self.gameRef.audio('swap_tick', { volume: 0.35 });
        }
      }
    });
  },

  adjacent: function (i, j) {
    if (i < 0 || j < 0) return false;
    var dx = Math.abs((i % BC.W) - (j % BC.W));
    var dy = Math.abs(((i / BC.W) | 0) - ((j / BC.W) | 0));
    return (dx + dy) === 1;
  },

  pollKeys: function () {
    if (!this.board) return;
    var self = this;
    function edge(code) {
      var down = self.kit.input.keyDown(code);
      var was = !!self.prevKeys[code];
      self.prevKeys[code] = down;
      return down && !was;
    }
    var moved = false;
    if (edge('ArrowLeft') && this.cursor % BC.W > 0) { this.cursor--; moved = true; }
    if (edge('ArrowRight') && this.cursor % BC.W < BC.W - 1) { this.cursor++; moved = true; }
    if (edge('ArrowUp') && this.cursor >= BC.W) { this.cursor -= BC.W; moved = true; }
    if (edge('ArrowDown') && this.cursor < this.board.n - BC.W) { this.cursor += BC.W; moved = true; }
    if (moved && !this.busy && !this.over) {
      if (this.selected >= 0 && this.adjacent(this.selected, this.cursor)) {
        var from = this.selected;
        this.setSelected(-1, 'ready');
        this.tryMove(from, this.cursor);
      } else {
        this.setSelected(this.cursor, 'ready');
      }
    }
    if (edge('Enter') || edge('Space')) {
      if (!this.busy && !this.over) {
        if (this.selected >= 0 && this.adjacent(this.selected, this.cursor)) {
          var picked = this.selected;
          this.setSelected(-1, 'ready');
          this.tryMove(picked, this.cursor);
        } else if (this.selected === this.cursor) {
          this.setSelected(-1, 'ready');
        } else {
          this.setSelected(this.cursor, 'ready');
        }
      }
    }
    if (edge('KeyR')) this.restart();
    if (edge('Escape')) this.leave();
    if (edge('KeyM')) this.gameRef.toggleMute();
    if (edge('KeyE')) {
      this.gameRef.unlock();
      this.gameRef.audio('ui_click');
      if (this.mode === 'endless') this.restart();
      else this.scene.start('play', { mode: 'endless' });
    }
  },

  setSelected: function (idx, state) {
    this.selected = idx;
    this.sel.state = state || 'ready';
    if (this.sel.state !== 'resolve') {
      this.sel.resolveCell = -1;
      this.tweens.killTweensOf(this.sel.resolve);
      if (this.L) this.sel.resolve.setDisplaySize(this.L.cell, this.L.cell).setAlpha(1);
    }
    this.updateSelector();
  },

  updateSelector: function () {
    var s = this.sel, L = this.L;
    if (!L) return;
    var resolving = s.state === 'resolve' && s.resolveCell >= 0 && !this.over;
    if (resolving) {
      var rv = this.cells[s.resolveCell];
      s.ring.setVisible(false);
      s.ghost.setVisible(false);
      s.arrow.setVisible(false);
      s.resolve.setVisible(true).setPosition(rv.bx, rv.by).setAlpha(1);
      return;
    }
    s.resolve.setVisible(false);
    if (this.selected < 0 || this.over) {
      s.ring.setVisible(false);
      s.ghost.setVisible(false);
      s.arrow.setVisible(false);
      return;
    }
    var v = this.cells[this.selected];
    s.ring.setVisible(true).setPosition(v.bx, v.by);
    s.ghost.setVisible(false);
    s.arrow.setVisible(false);
  },

  showPreview: function (i, j, valid) {
    var s = this.sel, L = this.L;
    if (!L || j < 0 || j >= this.board.n) return;
    var a = this.cells[i], b = this.cells[j];
    s.ghost.setTexture(valid ? 'bc_ghost_ok' : 'bc_ghost_no');
    s.ghost.setDisplaySize(L.cell, L.cell);
    s.ghost.setVisible(true).setPosition(b.bx, b.by).setAlpha(1);
    s.arrow.setVisible(true).setPosition((a.bx + b.bx) / 2, (a.by + b.by) / 2);
    s.arrow.setDisplaySize(L.cell * 0.5, L.cell * 0.5);
    s.arrow.setTint(valid ? 0xF7FBFF : 0xF25C68);
    s.arrow.setAngle(Math.atan2(b.by - a.by, b.bx - a.bx) * 180 / Math.PI);
    var self = this;
    this.tweens.killTweensOf(s.ghost);
    this.tweens.add({
      targets: [s.ghost, s.arrow], alpha: 0, duration: 320, delay: 130,
      onComplete: function () { s.ghost.setVisible(false); s.arrow.setVisible(false).setAlpha(1); s.ghost.setAlpha(1); }
    });
  },

  denyAt: function (i) {
    this.gameRef.audio('invalid', { volume: 0.55 });
    var v = this.cells[i];
    this.tweens.killTweensOf(v.img);
    var self = this, L = this.L;
    this.tweens.add({
      targets: v.img, x: v.bx + L.cell * 0.14, duration: 55, yoyo: true, repeat: 1,
      onComplete: function () { v.img.setPosition(v.bx, v.by); }
    });
  },

  /* ------------------------------------------------------------ moves */
  tryMove: function (i, j) {
    if (this.busy || this.over) return;
    if (!this.adjacent(i, j)) { this.setSelected(j, 'ready'); return; }
    if (this.tutorial && this.tutorial.phase === 'swap') {
      var tm = this.tutorial.move;
      var guided = (i === tm[0] && j === tm[1]) || (i === tm[1] && j === tm[0]);
      if (!guided) {
        this.showCoach('Follow the arrow for the first guided cascade.');
        this.denyAt(i);
        return;
      }
    }
    var legal = BC.canSwap(this.board, i, j);
    this.showPreview(i, j, legal);
    if (!legal) {
      this.setSelected(-1, 'ready');
      this.denyAt(i);
      return;
    }
    this.busy = true;
    this.sel.resolveCell = i;
    this.setSelected(-1, 'resolve');
    this.tweens.killTweensOf(this.sel.resolve);
    if (this.kit.juice.enabled) {
      this.tweens.add({
        targets: this.sel.resolve, scaleX: this.sel.resolve.scaleX * 1.10,
        scaleY: this.sel.resolve.scaleY * 1.10, alpha: 0.52,
        duration: 120, yoyo: true, ease: 'Sine.easeOut'
      });
    }
    if (this.tutorial) this.tutorial.phase = 'resolving';

    this.st.moves--;
    this.st.movesUsed++;
    this.updateHud();
    this.refreshVerify();

    BC.doSwap(this.board, i, j);
    this.gameRef.audio('swap_tick');

    var a = this.cells[i], b = this.cells[j], self = this;
    var ax = a.bx, ay = a.by, bx = b.bx, by = b.by;
    a.img.setDepth(2); b.img.setDepth(1);
    this.tweens.add({
      targets: a.img, x: bx, y: by, duration: 130, ease: 'Cubic.easeOut'
    });
    this.tweens.add({
      targets: b.img, x: ax, y: ay, duration: 130, ease: 'Cubic.easeOut',
      onComplete: function () {
        a.img.setPosition(ax, ay); b.img.setPosition(bx, by);
        a.img.setDepth(0); b.img.setDepth(0);
        a.key = ''; b.key = '';
        self.syncCells();
        self.resolveFrom(i, j);
      }
    });
  },

  resolveFrom: function (i, j) {
    var step = BC.swapClear(this.board, i, j, this.rand);
    this.chain = 0;
    if (!step) { this.finishMove(); return; }
    this.runStep(step, i);
  },

  /* One resolution beat: pop -> apply -> gravity -> settle -> next. */
  runStep: function (step, pivot) {
    var self = this, L = this.L, b = this.board;
    var chain = this.chain;

    if (step.combo) {
      this.st.combos++;
      this.comboBeat(step, pivot);
    }

    /* detonation flashes for every special that fired */
    var f, fi;
    for (fi = 0; fi < (step.fx ? step.fx.length : 0); fi++) {
      f = step.fx[fi];
      this.detonateFx(f.i, f.sp);
    }
    if (step.fx && step.fx.length) this.gameRef.audio('detonate', { volume: 0.7 });

    /* Pop the view records while the simulation advances immediately below.
     * The step arrays are copied because the board is about to be compacted. */
    var cells = step.cells.slice(0), k, idx, v, fam, tint;
    var popMs = this.kit.juice.enabled ? 150 : 100;
    for (k = 0; k < cells.length; k++) {
      idx = cells[k];
      v = this.cells[idx];
      if (b.c[idx] === BC.EMPTY) continue;
      fam = BC.familyAt(b.c[idx]);
      tint = (b.c[idx] === BC.ACORN) ? 0xC99461 : (b.c[idx] === BC.PRISMC ? 0xF7FBFF : fam.face);
      this.fx.burst(v.bx, v.by, tint, cells.length > 12 ? 2 : 3, 130);
      this.tweens.killTweensOf(v.img);
      if (this.kit.juice.enabled) {
        this.tweens.add({
          targets: v.img, scaleX: v.img.scaleX * 1.16, scaleY: v.img.scaleY * 1.16,
          alpha: 0, duration: popMs, ease: 'Quad.easeOut'
        });
      } else {
        this.tweens.add({ targets: v.img, alpha: 0, duration: popMs, ease: 'Linear' });
      }
    }
    if (cells.length) {
      this.gameRef.audio(chain > 0 ? 'cascade' : 'match', {
        rate: BC.clamp(1 + chain * 0.07, 0.9, 1.7), volume: 0.85
      });
    }
    /* Creation rings fire now. The new piece scale is applied after the
     * post-gravity board has been synced in settle(). */
    for (k = 0; k < step.creates.length; k++) {
      var created = step.creates[k];
      var createdView = this.cells[created.i];
      if (createdView) this.fx.ring(createdView.bx, createdView.by,
        created.sp === BC.SP.PRISM ? 0xF7FBFF : 0xF7C948, 2.6, 0.45);
    }
    if (step.creates.length) this.gameRef.audio('special', { volume: 0.8 });

    /* escalation ladder: contact accent, then rim + nudge only at tiers */
    var big = cells.length;
    if (chain >= 1 || big >= 8) this.fx.kick(chain >= 3 || big >= 14 ? 4.5 : 2.4, 150);
    if (chain >= 2) {
      this.fx.ring(L.cell * BC.W * 0.5, L.cell * BC.H * 0.5, this.seg.accent, 6.5, 0.5);
    }
    var hold = this.kit.juice.enabled ? ((chain >= 3 || big >= 14) ? 70 : (chain >= 1 ? 40 : 0)) : 0;

    /* Advance counters, syrup and gravity before the cosmetic hold. No timer
     * can now delay the authoritative board state. */
    var res = BC.applyClear(b, step, this.st);
    this.st.cleared += res.cleared;
    this.st.score += BC.scoreFor(res.cleared, chain) + res.syrup * 120;
    if (chain > this.st.bestChain) this.st.bestChain = chain;

    var q;
    for (q = 0; q < res.syrCells.length; q++) {
      var sv = this.cells[res.syrCells[q]];
      this.fx.droplet(sv.bx, sv.by, 3);
    }
    if (res.syrup > 0) this.gameRef.audio('syrup', { volume: 0.6 });

    var gr = BC.gravity(b, this.rand, this.lv, this.st);
    this.st.score += gr.acorns.length * 500;
    for (q = 0; q < gr.acorns.length; q++) {
      var av = this.cells[gr.acorns[q]];
      this.fx.ring(av.bx, av.by, 0xC99461, 3.0, 0.5);
      this.fx.burst(av.bx, av.by, 0xC99461, 4, 160);
    }
    if (gr.acorns.length) {
      this.gameRef.audio('acorn', { volume: 0.9 });
      this.toast.chip(gr.acorns.length + ' acorn' + (gr.acorns.length > 1 ? 's' : '') + ' delivered', {
        icon: 'acorn', tint: 0xC99461,
        x: this.L.W / 2, y: this.L.by - 46, hold: 700
      });
    }

    this.updateHud();
    this.refreshVerify();
    this.time.delayedCall(popMs + hold, function () {
      if (!self.scene.isActive()) return;
      self.settle(gr, chain, step.creates);
    });
  },

  settle: function (gr, chain, creates) {
    var self = this, L = this.L, i, v;
    this.resetCellTransforms();
    this.syncCells();
    for (var c = 0; c < (creates ? creates.length : 0); c++) this.createFx(creates[c], true);

    var maxMs = 0;
    for (var key in gr.falls) {
      i = key | 0;
      v = this.cells[i];
      var dist = gr.falls[key];
      var ms = BC.clamp(110 + dist * 26, 120, 340);
      if (ms > maxMs) maxMs = ms;
      v.img.setPosition(v.bx, v.by - dist * L.cell);
      var baseX = v.img.scaleX, baseY = v.img.scaleY;
      (function (piece, targetY, bx0, by0) {
        self.tweens.add({
          targets: piece, y: targetY, duration: ms,
          ease: self.kit.juice.enabled ? 'Back.easeOut' : 'Cubic.easeOut',
          easeParams: self.kit.juice.enabled ? [1.1] : undefined,
          onComplete: function () {
            if (!self.kit.juice.enabled) return;
            self.tweens.add({
              targets: piece, scaleX: bx0 * 1.04, scaleY: by0 * 1.04,
              duration: 90, yoyo: true, ease: 'Sine.easeOut'
            });
          }
        });
      })(v.img, v.by, baseX, baseY);
      this.fx.streak(v.bx, v.by, Math.max(0.65, dist) * L.cell * 0.35, 0xFFFFFF);
    }
    if (maxMs === 0) maxMs = 60;

    this.time.delayedCall(maxMs + 40, function () {
      if (!self.scene.isActive()) return;
      self.resetCellTransforms();
      self.syncCells();
      var next = BC.stepClear(self.board, -1, self.rand);
      if (next) {
        self.chain = chain + 1;
        self.runStep(next, -1);
      } else {
        self.chain = 0;
        self.finishMove();
      }
    });
  },

  comboBeat: function (step, pivot) {
    var L = this.L;
    var tier = step.tier || 2;
    this.gameRef.audio('combo', { volume: 0.9 });
    this.fx.kick(tier >= 4 ? 6 : 4, 200);
    var cx = pivot >= 0 ? this.cells[pivot].bx : L.cell * BC.W * 0.5;
    var cy = pivot >= 0 ? this.cells[pivot].by : L.cell * BC.H * 0.5;
    this.fx.ring(cx, cy, this.seg.accent, 5 + tier, 0.6);
    /* corner chip, never a centre banner: this is live play */
    this.toast.chip(step.combo, {
      icon: 'combo', tint: this.seg.accent,
      x: L.W / 2, y: L.by - 46, hold: 800
    });
  },

  detonateFx: function (idx, sp) {
    var L = this.L, v = this.cells[idx], k;
    if (!v) return;
    if (sp === BC.SP.LH) {
      for (k = 0; k < BC.W; k++) this.fx.burst(k * L.cell + L.cell / 2, v.by, 0xF7FBFF, 1, 200);
    } else if (sp === BC.SP.LV) {
      for (k = 0; k < BC.H; k++) this.fx.burst(v.bx, k * L.cell + L.cell / 2, 0xF7FBFF, 1, 200);
    } else if (sp === BC.SP.BURST) {
      this.fx.ring(v.bx, v.by, 0xF7C948, 3.2, 0.45);
      this.fx.burst(v.bx, v.by, 0xF7C948, 6, 260);
    } else if (sp === BC.SP.PRISM) {
      this.fx.ring(v.bx, v.by, 0xF7FBFF, 7.5, 0.65);
      this.fx.burst(v.bx, v.by, 0x9A7CF3, 6, 300);
    }
  },

  createFx: function (cr, deferRing) {
    var v = this.cells[cr.i];
    if (!v) return;
    if (!deferRing) this.fx.ring(v.bx, v.by, cr.sp === BC.SP.PRISM ? 0xF7FBFF : 0xF7C948, 2.6, 0.45);
    var self = this;
    if (!this.kit.juice.enabled) {
      v.img.setScale(this.L.cell / BCArt.TILE, this.L.cell / BCArt.TILE);
      return;
    }
    this.time.delayedCall(160, function () {
      if (!self.scene.isActive()) return;
      var img = self.cells[cr.i].img;
      self.tweens.killTweensOf(img);
      img.setScale(img.scaleX * 0.6, img.scaleY * 0.6);
      self.tweens.add({
        targets: img, scaleX: self.L.cell / BCArt.TILE, scaleY: self.L.cell / BCArt.TILE,
        duration: 260, ease: self.kit.juice.enabled ? 'Back.easeOut' : 'Cubic.easeOut'
      });
    });
  },

  /* ------------------------------------------------------- end of move */
  finishMove: function () {
    var self = this;
    this.resetCellTransforms();
    this.syncCells();
    this.updateHud();
    this.refreshVerify();

    if (this.tutorial && this.tutorial.phase === 'resolving') {
      this.gameRef.save.tut = Math.max(this.gameRef.save.tut | 0, 1);
      this.gameRef.persist();
      this.tutorial = null;
      this.showCoach('Match cleared. The berries fell and refilled.');
    }
    if (this.lessonToSet > 0) {
      if (this.lessonToSet === 4) this.gameRef.save.seenGauntlet = 1;
      else this.gameRef.save.tut = Math.max(this.gameRef.save.tut | 0, this.lessonToSet);
      this.gameRef.persist();
      this.lessonToSet = 0;
    }

    if (this.mode === 'endless') {
      var stage = BC.endlessStage(this.st.score);
      if (stage > this.endlessStage) {
        this.endlessStage = stage;
        var refill = BC.endlessRefill(stage);
        this.st.moves += refill;
        this.lv.colors = BC.buildEndless(stage, 0).colors;
        this.updateHud();
        this.toast.chip('Stage ' + (stage + 1) + '  +' + refill + ' moves', {
          icon: 'infinity', tint: 0x5BCB77,
          x: this.L.W / 2, y: this.L.by - 46, hold: 900
        });
        this.fx.ring(this.L.cell * BC.W * 0.5, this.L.cell * BC.H * 0.5, 0x5BCB77, 7, 0.6);
        this.gameRef.audio('medal', { volume: 0.8 });
      }
    } else if (BC.goalsMet(this.lv, this.st)) {
      this.win();
      return;
    }

    if (this.st.moves <= 0) { this.lose(); return; }

    if (!BC.listMoves(this.board).length) {
      this.toast.chip('No moves left, reshuffling', {
        icon: 'restart', tint: 0xF7C948,
        x: this.L.W / 2, y: this.L.by - 46, hold: 800
      });
      BC.shuffle(this.board, this.rand, this.lv);
      this.syncCells();
    }

    this.busy = false;
    this.hintAt = this.time.now + 6000;
  },

  win: function () {
    this.over = true;
    this.busy = true;
    this.setSelected(-1, 'ready');
    var self = this, L = this.L;
    var stars = BC.starsFor(this.lv, this.st);
    var md = BC.medalBreakdown(this.lv, this.st, true);
    this.gameRef.audio('goal', { volume: 1 });
    this.fx.confetti(L.cell * BC.W * 0.5, L.cell * BC.H * 0.35, L.cell * BC.W * 0.8, this.seg.accent);
    this.fx.ring(L.cell * BC.W * 0.5, L.cell * BC.H * 0.5, this.seg.accent, 9, 0.8);
    this.fx.kick(6, 220);

    var crowned = this.gameRef.recordWin(this.mode, this.mode === 'gauntlet' ? this.gauntletIndex : this.groveIndex,
      stars, this.st.score, md.medal);

    this.busyOverlay = true;
    this.toast.banner('Grove clear', {
      sub: BC.MEDALS[md.medal].charAt(0).toUpperCase() + BC.MEDALS[md.medal].slice(1) + ' medal',
      color: '#5BCB77', x: L.W / 2, y: L.H * 0.40, hold: 900,
      onDone: function () {
        self.gameRef.audio('medal', { volume: 0.85 });
        if (crowned) {
          self.time.delayedCall(200, function () { self.scene.start('crown'); });
        } else {
          self.showResult(true, stars, md);
        }
      }
    });
  },

  lose: function () {
    this.over = true;
    this.busy = true;
    this.setSelected(-1, 'ready');
    var self = this, L = this.L;
    this.gameRef.audio('invalid', { volume: 0.8 });
    if (this.mode === 'endless') {
      this.gameRef.recordEndless(this.st.score, this.endlessStage);
    }
    this.busyOverlay = true;
    this.toast.banner(this.mode === 'endless' ? 'Cascade over' : 'Out of moves', {
      sub: this.mode === 'endless' ? ('Score ' + this.st.score) : 'Retry costs nothing',
      color: '#F7C948', x: L.W / 2, y: L.H * 0.40, hold: 850,
      onDone: function () { self.showResult(false, 0, BC.medalBreakdown(self.lv, self.st, false)); }
    });
  },

  /* ------------------------------------------------------ result card */
  buildResult: function () {
    var self = this;
    var box = this.add.container(0, 0);
    box.setDepth(80);
    this.overLayer.add(box);
    box.setVisible(false);

    var scrim = this.add.image(0, 0, 'bc_scrim').setOrigin(0, 0);
    scrim.setAlpha(0.72);
    var card = this.add.image(0, 0, 'bc_px');
    var title = BCUI.text(this, 0, 0, '', 26, 800, '#FFFFFF');
    var sub = BCUI.text(this, 0, 0, '', 14, 650, '#C9D4E4');
    var stars = [];
    for (var i = 0; i < 3; i++) stars.push(this.add.image(0, 0, 'bc_star0'));
    var medal = this.add.image(0, 0, 'bc_medal1');
    var lines = [];
    for (i = 0; i < 3; i++) lines.push(BCUI.text(this, 0, 0, '', 14, 650, '#C9D4E4'));

    box.add(scrim); box.add(card); box.add(title); box.add(sub);
    for (i = 0; i < 3; i++) box.add(stars[i]);
    box.add(medal);
    for (i = 0; i < 3; i++) box.add(lines[i]);

    var btnA = BCUI.pill(this, { label: 'Next', w: 150, h: 50, fill: 0x5BCB77, icon: 'play', onPress: function () { self.resultA(); } });
    var btnB = BCUI.pill(this, { label: 'Retry', w: 150, h: 50, fill: 0x2E4269, color: '#F7FBFF', icon: 'restart', iconTint: 0xF7FBFF, onPress: function () { self.resultB(); } });
    var btnC = BCUI.button(this, { icon: 'map', size: 46, fill: 0x1C2A46, onPress: function () { self.leave(); } });
    box.add(btnA.root); box.add(btnB.root); box.add(btnC.root);

    this.resultBox = box;
    this.resultParts = { scrim: scrim, card: card, title: title, sub: sub, stars: stars, medal: medal, lines: lines, a: btnA, b: btnB, c: btnC };
  },

  layoutResult: function (L) {
    if (!this.resultParts) return;
    var p = this.resultParts;
    p.scrim.setDisplaySize(L.W, L.H);
    var w = Math.min(L.W - 32, 340), h = 372;
    var key = 'bc_card_' + Math.round(w) + 'x' + h;
    if (!this.textures.exists(key)) BCArt.bakeCard(this, key, w, h, 22, 0x18253F, 0.98, 0xF7FBFF, 0.22);
    var cx = L.W / 2, cy = L.H / 2;
    p.card.setTexture(key).setPosition(cx, cy).setDisplaySize(w, h);
    p.title.setPosition(cx, cy - h / 2 + 40);
    p.sub.setPosition(cx, cy - h / 2 + 68);
    var i;
    for (i = 0; i < 3; i++) {
      p.stars[i].setPosition(cx + (i - 1) * 52, cy - h / 2 + 116);
      p.stars[i].setDisplaySize(44, 44);
    }
    p.medal.setPosition(cx, cy - h / 2 + 116);
    p.medal.setDisplaySize(56, 56);
    for (i = 0; i < 3; i++) p.lines[i].setPosition(cx, cy - h / 2 + 168 + i * 22);
    p.a.root.setPosition(cx + 80, cy + h / 2 - 76);
    p.b.root.setPosition(cx - 80, cy + h / 2 - 76);
    p.c.root.setPosition(cx, cy + h / 2 - 26);
  },

  showResult: function (won, stars, md) {
    var p = this.resultParts, L = this.L, i;
    this.busyOverlay = true;
    this.layoutResult(L);
    BCUI.setText(p.title, won ? this.lv.name : 'Out of moves');
    var best = this.gameRef.bestFor(this.mode, this.mode === 'gauntlet' ? this.gauntletIndex : this.groveIndex);
    BCUI.setText(p.sub, this.mode === 'endless'
      ? ('Best ' + Math.max(best, this.st.score))
      : ('Score ' + this.st.score + '   Best ' + Math.max(best, won ? this.st.score : 0)));

    var showStars = this.mode !== 'endless';
    for (i = 0; i < 3; i++) {
      p.stars[i].setVisible(showStars && won);
      p.stars[i].setTexture(i < stars ? 'bc_star1' : 'bc_star0');
      p.stars[i].setDisplaySize(44, 44);
    }
    p.medal.setVisible(won && md.medal > 0 && this.mode !== 'endless');
    if (p.medal.visible) {
      p.medal.setTexture('bc_medal' + md.medal);
      p.medal.setDisplaySize(56, 56);
      p.medal.setPosition(L.W / 2 + 104, p.medal.y);
    }

    if (this.mode === 'endless') {
      BCUI.setText(p.lines[0], 'Stage reached ' + (this.endlessStage + 1));
      BCUI.setText(p.lines[1], 'Best cascade x' + (this.st.bestChain + 1));
      BCUI.setText(p.lines[2], 'Combos ' + this.st.combos);
    } else {
      BCUI.setText(p.lines[0], 'Moves left ' + this.st.moves + ' of ' + this.lv.moves + '  (' + md.effPct + '%)');
      BCUI.setText(p.lines[1], 'Combos ' + md.combos + '   Best cascade x' + (this.st.bestChain + 1));
      BCUI.setText(p.lines[2], won ? ('Medal: ' + BC.MEDALS[md.medal]) : 'Nothing lost, the grove resets free');
    }
    for (i = 0; i < 3; i++) p.lines[i].setVisible(true);

    var canNext = won && this.nextTarget() !== null;
    p.a.setLabel(canNext ? 'Next' : (this.mode === 'endless' ? 'Again' : 'Retry')).setEnabled(true);
    p.b.setLabel(won ? 'Replay' : 'Retry').setEnabled(true);

    this.resultBox.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.resultBox, alpha: 1, duration: 200 });
    this.refreshVerify();
  },

  nextTarget: function () {
    if (this.mode === 'trail') {
      return this.groveIndex + 1 < BC.GROVE_COUNT ? { mode: 'trail', n: this.groveIndex + 1 } : null;
    }
    if (this.mode === 'gauntlet') {
      var gi = this.gauntletIndex + 1;
      if (gi < BC.GAUNTLET.length && BC.gauntletUnlocked(gi, this.gameRef.save)) return { mode: 'gauntlet', gi: gi };
      return null;
    }
    return null;
  },

  resultA: function () {
    this.gameRef.audio('ui_click');
    var t = this.nextTarget();
    this.resultBox.setVisible(false);
    this.busyOverlay = false;
    if (t) { this.scene.restart(t); return; }
    this.restart();
  },

  resultB: function () {
    this.gameRef.audio('ui_click');
    this.resultBox.setVisible(false);
    this.busyOverlay = false;
    this.restart();
  },

  /* -------------------------------------------------------- main loop */
  update: function (time, delta) {
    /* Clamp so a degraded device gets slow motion, never a time skip. */
    var dt = Math.min(delta, 50) / 1000;
    if (this.kit.paused) return;

    this.fx.update(dt);
    this.updateMotes(dt);

    /* Only touch the layer transforms while a nudge is actually running:
     * moving a container dirties every child, and the board carries ~140. */
    var n = this.fx.nudge;
    if (this.L && (n.dur > 0 || this.nudged)) {
      this.nudged = n.dur > 0;
      this.boardLayer.setPosition(n.x, n.y);
      this.pieceLayer.setPosition(this.L.bx + this.L.pad + n.x, this.L.by + this.L.pad + n.y);
      this.fxLayer.setPosition(this.L.bx + this.L.pad + n.x, this.L.by + this.L.pad + n.y);
    }

    this.pollKeys();

    /* Ready-state breathing on the selector */
    var s = this.sel;
    if (s.ring.visible && this.L && this.kit.juice.enabled) {
      s.t += dt;
      var base = this.L.cell / BCArt.TILE;
      var k = base * (1 + Math.sin(s.t * 4.2) * 0.03);
      s.ring.setScale(k, k);
    }

    /* idle hint: one arrow on a legal move, opt-out in settings */
    if (!this.busy && !this.over && this.hintAt && time > this.hintAt && this.gameRef.prefs.hints !== false) {
      var mv = BC.firstMove(this.board);
      if (mv) {
        this.showPreview(mv[0], mv[1], true);
        this.setSelected(mv[0], 'ready');
      }
      this.hintAt = time + 8000;
    }
  },

  /* ------------------------------------------------------ verification */
  refreshVerify: function () {
    var g = this.gameRef;
    if (!g) return;
    g.verify.scene = 'play';
    g.verify.mode = this.mode;
    g.verify.grove = this.mode === 'gauntlet' ? this.gauntletIndex : this.groveIndex;
    g.verify.groveName = this.lv ? this.lv.name : '';
    g.verify.segment = this.seg ? this.seg.id : '';
    g.verify.moves = this.st ? this.st.moves : 0;
    g.verify.movesTotal = this.lv ? this.lv.moves : 0;
    g.verify.score = this.st ? this.st.score : 0;
    g.verify.combos = this.st ? this.st.combos : 0;
    g.verify.over = this.over;
    g.verify.goals = {
      score: { have: this.st ? this.st.score : 0, need: this.lv ? this.lv.target : 0 },
      syrup: { have: this.st ? this.st.syrup : 0, need: this.lv ? this.lv.syrupTotal : 0 },
      acorns: { have: this.st ? this.st.acorns : 0, need: this.lv ? this.lv.acorns : 0 }
    };
    g.verify.fx = this.fx ? this.fx.stats() : null;
  }
});
