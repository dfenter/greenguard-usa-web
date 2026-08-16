/* hb_menu.js — Hullbreaker shell scenes: title, sector select, and the
 * shared button layer. Every button is hit-tested against the GGKit
 * pointer map through Tap, so the kit remains the only input path.
 */
(function () {
  'use strict';

  var I = window.HB_INTERNAL;
  var D = window.HB_DATA;
  var kit = I.kit, Tap = I.Tap, HB = I.HB_STATE;
  var clamp = I.clamp, txt = I.txt, tex = I.tex, FONT = I.FONT;
  var setTextIfChanged = I.setTextIfChanged;

  // ------------------------------------------------------------ buttons
  // A button is plain data plus its own display objects. Nothing about the
  // press state is stored on a shared record, so two buttons can never
  // trade highlight state.
  function Buttons(scene) {
    this.scene = scene;
    this.list = [];
    this.holding = null;
  }
  Buttons.prototype.add = function (b) {
    b.enabled = b.enabled !== false;
    b.held = false;
    this.list.push(b);
    return b;
  };
  Buttons.prototype.clear = function () {
    for (var i = 0; i < this.list.length; i++) {
      if (this.list[i].held) this.list[i].held = false;
      if (this.list[i].destroy) this.list[i].destroy();
    }
    this.list.length = 0;
    this.holding = null;
  };
  Buttons.prototype.hitTest = function (p) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var b = this.list[i];
      if (!b.enabled || b.hidden) continue;
      if (b.r != null) { if (I.inCircle(p, b)) return b; }
      else if (I.inRect(p, b)) return b;
    }
    return null;
  };
  Buttons.prototype.update = function (tap) {
    var i, b;
    for (i = 0; i < tap.pressed.length; i++) {
      b = this.hitTest(tap.pressed[i]);
      if (b) { this.holding = { id: tap.pressed[i].id, btn: b }; b.held = true; }
    }
    for (i = 0; i < tap.released.length; i++) {
      var rp = tap.released[i];
      if (this.holding && this.holding.id === rp.id) {
        var target = this.hitTest(rp);
        this.holding.btn.held = false;
        if (target === this.holding.btn && target.onTap) {
          kit.audio.sfx('ui', { volume: 0.6 });
          target.onTap();
        }
        this.holding = null;
      }
    }
    // a pointer that never released (pause, blur) must not leave a stuck hold
    if (this.holding && !tap.live.has(this.holding.id)) {
      this.holding.btn.held = false;
      this.holding = null;
    }
    for (i = 0; i < this.list.length; i++) {
      b = this.list[i];
      if (b.setVisible) b.setVisible(!b.hidden);
      if (b.paint) b.paint(b.held && b.enabled);
    }
  };

  // Draws a slab button: rounded plate, edge light, label.
  function slab(scene, opts) {
    var g = scene.add.graphics().setDepth(opts.depth || 60);
    var label = txt(scene, 0, 0, opts.text, opts.size || 20, opts.color || '#eaf9ff', '800')
      .setOrigin(0.5).setDepth((opts.depth || 60) + 1);
    var sub = opts.sub ? txt(scene, 0, 0, opts.sub, (opts.size || 20) * 0.56, '#8fb3c6', '600')
      .setOrigin(0.5).setDepth((opts.depth || 60) + 1) : null;
    var btn = {
      x: 0, y: 0, w: opts.w, h: opts.h, tint: opts.tint || 0x39c6f0,
      onTap: opts.onTap, enabled: opts.enabled !== false,
      setPos: function (x, y) {
        btn.x = x; btn.y = y;
        label.setPosition(x + btn.w / 2, y + btn.h / 2 - (sub ? btn.h * 0.12 : 0));
        if (sub) {
          sub.setWordWrapWidth(Math.max(90, btn.w - 18), false);
          sub.setPosition(x + btn.w / 2, y + btn.h * 0.72);
        }
      },
      setText: function (t) { setTextIfChanged(label, t); },
      setSub: function (t) { if (sub) setTextIfChanged(sub, t); },
      setVisible: function (v) {
        g.setVisible(v); label.setVisible(v); if (sub) sub.setVisible(v);
      },
      setEnabled: function (v) {
        btn.enabled = v;
        label.setAlpha(v ? 1 : 0.4);
        if (sub) sub.setAlpha(v ? 1 : 0.4);
      },
      destroy: function () { g.destroy(); label.destroy(); if (sub) sub.destroy(); },
      paint: function (held) {
        g.clear();
        var r = Math.min(16, btn.h * 0.3);
        var a = btn.enabled ? (held ? 0.95 : 0.72) : 0.25;
        g.fillStyle(0x0d1d2a, a);
        g.fillRoundedRect(btn.x, btn.y, btn.w, btn.h, r);
        g.lineStyle(2, btn.tint, btn.enabled ? (held ? 1 : 0.8) : 0.28);
        g.strokeRoundedRect(btn.x, btn.y, btn.w, btn.h, r);
        if (btn.enabled) {
          g.fillStyle(btn.tint, held ? 0.26 : 0.12);
          g.fillRoundedRect(btn.x + 3, btn.y + 3, btn.w - 6, btn.h * 0.42, r * 0.7);
        }
      }
    };
    return btn;
  }

  // Small round icon button (settings, back).
  function pip(scene, opts) {
    var g = scene.add.graphics().setDepth(opts.depth || 60);
    var label = txt(scene, 0, 0, opts.text, opts.size || 17, opts.color || '#cfe9f6', '800')
      .setOrigin(0.5).setDepth((opts.depth || 60) + 1);
    var btn = {
      x: 0, y: 0, r: opts.r || 22, tint: opts.tint || 0x5fd0f0, onTap: opts.onTap,
      setPos: function (x, y) { btn.x = x; btn.y = y; label.setPosition(x, y + 1); },
      setText: function (t) { setTextIfChanged(label, t); },
      setVisible: function (v) { g.setVisible(v); label.setVisible(v); },
      destroy: function () { g.destroy(); label.destroy(); },
      paint: function (held) {
        g.clear();
        g.fillStyle(0x0d1d2a, held ? 0.95 : 0.66);
        g.fillCircle(btn.x, btn.y, btn.r);
        g.lineStyle(2, btn.tint, held ? 1 : 0.75);
        g.strokeCircle(btn.x, btn.y, btn.r);
      }
    };
    return btn;
  }

  // =====================================================================
  // Title
  // =====================================================================
  var TitleScene = {
    key: 'Title',
    create: function () {
      var scene = this;
      this.sky = I.makeBackdrop(this, D.sectorAt(0));
      this.buttons = new Buttons(this);
      HB.mode = 'title';
      Tap.clear();
      Tap.refreshRect();
      kit.audio.music('musicField', 1200);

      // A forced sector is a deterministic entry point for the orchestrator:
      // it drops straight into the run rather than making a probe tap twice.
      if (HB.forceSector) {
        var idx = clamp(HB.forceSector - 1, 0, D.SECTORS.length - 1);
        this.scene.start('Play', { sector: idx, wave: HB.forceWave || 1 });
        return;
      }

      this.logo = this.add.image(0, 0, tex(this, 'logo')).setDepth(20);
      this.tag = txt(this, 0, 0, 'SEEDED ASTEROID SURVIVAL', 15, '#7fd6f2', '700')
        .setOrigin(0.5).setDepth(20);
      this.stat = txt(this, 0, 0, '', 13, '#7d9cad', '600').setOrigin(0.5).setDepth(20);
      this.hint = txt(this, 0, 0, 'Left half steers and thrusts. Right half fires and dashes.',
        12, '#5f7f90', '600').setOrigin(0.5).setDepth(20);

      this.playBtn = this.buttons.add(slab(this, {
        w: 240, h: 62, text: 'LAUNCH', sub: 'choose a sector', tint: 0x5fe0ff,
        onTap: function () { scene.scene.start('Select'); }
      }));
      this.setBtn = this.buttons.add(pip(this, {
        text: '⚙', r: 22, onTap: function () { I.openSettings(); }
      }));

      // drifting demo rocks so the title screen is never a still frame
      this.demo = [];
      var rng = I.mulberry32(0x51F17);
      for (var i = 0; i < 9; i++) {
        var fam = ['belt', 'ice', 'wreck', 'crystal', 'maw'][i % 5];
        var sz = i % 3 === 0 ? 'l0' : (i % 3 === 1 ? 'm0' : 's0');
        var img = I.img(this, 0, 0, 'rock_' + fam + '_' + sz).setDepth(5)
          .setAlpha(0.5).setScale(0.7);
        this.demo.push({
          img: img, x: rng(), y: rng(),
          vx: I.rngRange(rng, -22, 22), vy: I.rngRange(rng, -16, 16),
          spin: I.rngRange(rng, -0.3, 0.3)
        });
      }

      this.layout();
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () { scene.scale.off('resize', scene.layout, scene); });
    },
    layout: function () {
      var W = this.scale.width, H = this.scale.height;
      var ins = I.safeInsets();
      this.sky.resize(W, H);
      var s = clamp(Math.min(W / 900, H / 480), 0.62, 1.25);
      this.logo.setPosition(W / 2, H * 0.27).setScale(Math.min(1, (W * 0.72) / this.logo.width));
      this.tag.setPosition(W / 2, H * 0.27 + this.logo.displayHeight * 0.46).setFontSize(Math.round(15 * s));
      var best = 0, medals = 0, k;
      for (k in I.PROFILE.best) best = Math.max(best, I.PROFILE.best[k] || 0);
      for (k in I.PROFILE.medals) if (I.PROFILE.medals[k] && I.PROFILE.medals[k] !== 'none') medals++;
      setTextIfChanged(this.stat, 'BEST ' + I.pad(best, 6) + '   SECTORS CLEARED ' + medals +
        ' / ' + D.SECTORS.length);
      this.stat.setPosition(W / 2, H * 0.62).setFontSize(Math.round(13 * s));
      this.hint.setPosition(W / 2, H - ins.b - 26).setFontSize(Math.round(12 * s));
      this.playBtn.w = Math.round(240 * s); this.playBtn.h = Math.round(62 * s);
      this.playBtn.setPos(W / 2 - this.playBtn.w / 2, H * 0.70);
      this.setBtn.r = Math.round(22 * s);
      this.setBtn.setPos(W - ins.r - 34 * s, ins.t + 34 * s);
      Tap.refreshRect();
    },
    update: function (time, delta) {
      var dt = Math.min(0.05, delta / 1000);
      var W = this.scale.width, H = this.scale.height;
      this.sky.tick(dt, 14, 6);
      for (var i = 0; i < this.demo.length; i++) {
        var d = this.demo[i];
        d.x = (d.x + (d.vx / W) * dt + 1) % 1;
        d.y = (d.y + (d.vy / H) * dt + 1) % 1;
        d.img.setPosition(d.x * W, d.y * H);
        d.img.rotation += d.spin * dt;
      }
      this.buttons.update(Tap.update());
      HB.mode = 'title';
      HB.unlocked = I.unlockedCount();
    }
  };

  // =====================================================================
  // Sector select
  // =====================================================================
  var SelectScene = {
    key: 'Select',
    create: function () {
      var scene = this;
      HB.mode = 'select';
      Tap.clear();
      Tap.refreshRect();
      this.sky = I.makeBackdrop(this, D.sectorAt(0));
      this.buttons = new Buttons(this);
      this.pick = clamp((HB.forceSector || I.unlockedCount()) - 1, 0, D.SECTORS.length - 1);
      if (this.pick >= I.unlockedCount()) this.pick = I.unlockedCount() - 1;

      this.title = txt(this, 0, 0, 'SECTOR SELECT', 22, '#eaf9ff', '800').setOrigin(0.5).setDepth(20);
      this.name = txt(this, 0, 0, '', 30, '#ffffff', '800').setOrigin(0.5).setDepth(20);
      this.sub = txt(this, 0, 0, '', 14, '#8fb3c6', '600').setOrigin(0.5).setDepth(20);
      this.detail = txt(this, 0, 0, '', 13, '#7fd6f2', '600').setOrigin(0.5).setDepth(20);
      this.lockNote = txt(this, 0, 0, '', 13, '#ff9a8a', '700').setOrigin(0.5).setDepth(20);

      this.nodesG = this.add.graphics().setDepth(15);
      this.nodeLabels = [];
      this.nodeBtns = [];
      for (var i = 0; i < D.SECTORS.length; i++) {
        (function (idx) {
          var b = scene.buttons.add(pip(scene, {
            text: String(idx + 1), r: 26, tint: 0x5fd0f0,
            onTap: function () { scene.select(idx); }
          }));
          scene.nodeBtns.push(b);
          scene.nodeLabels.push(txt(scene, 0, 0, D.SECTORS[idx].name, 11, '#7d9cad', '700')
            .setOrigin(0.5).setDepth(20));
        }(i));
      }

      this.startBtn = this.buttons.add(slab(this, {
        w: 220, h: 58, text: 'DEPLOY', tint: 0x5fe0ff,
        onTap: function () { scene.deploy(); }
      }));
      this.ladderBtn = this.buttons.add(slab(this, {
        w: 220, h: 58, text: 'DAILY LADDER', sub: 'seeded survival', tint: 0xffc46a,
        onTap: function () { scene.deployLadder(); }
      }));
      this.salvageText = txt(this, 0, 0, '', 14, '#7ef0b4', '800').setOrigin(0.5).setDepth(20);
      this.refitBtns = [];
      for (var ri = 0; ri < D.REFIT_ORDER.length; ri++) {
        (function (id) {
          var ref = D.refit(id);
          var b = scene.buttons.add(slab(scene, {
            w: 78, h: 42, text: ref.short, sub: 'LV 0', tint: ref.tint, size: 15,
            onTap: function () { scene.buyRefit(id); }
          }));
          scene.refitBtns.push(b);
        }(D.REFIT_ORDER[ri]));
      }
      this.backBtn = this.buttons.add(pip(this, {
        text: '←', r: 22, onTap: function () { scene.scene.start('Title'); }
      }));
      this.setBtn = this.buttons.add(pip(this, {
        text: '⚙', r: 22, onTap: function () { I.openSettings(); }
      }));

      this.layout();
      this.refresh();
      this.scale.on('resize', this.layout, this);
      this.events.once('shutdown', function () { scene.scale.off('resize', scene.layout, scene); });
    },
    select: function (idx) {
      this.pick = clamp(idx, 0, D.SECTORS.length - 1);
      this.refresh();
    },
    deploy: function () {
      if (this.pick + 1 > I.unlockedCount()) return;
      this.scene.start('Play', { sector: this.pick, wave: HB.forceWave || 1 });
    },
    deployLadder: function () {
      this.scene.start('Play', { ladder: true, stage: 1, sector: 0, wave: 1 });
    },
    buyRefit: function (id) {
      var level = I.PROFILE.refits[id] || 0;
      var ref = D.refit(id);
      if (level >= ref.max) return;
      var cost = D.refitCost(id, level);
      if ((I.PROFILE.salvage || 0) < cost) return;
      I.PROFILE.salvage -= cost;
      I.PROFILE.refits[id] = level + 1;
      I.saveProfile();
      kit.audio.sfx('upgrade', { volume: 0.8 });
      this.refresh();
    },
    refresh: function () {
      var s = D.sectorAt(this.pick);
      var unlocked = this.pick + 1 <= I.unlockedCount();
      this.sky.setSector(s);
      setTextIfChanged(this.name, s.name);
      setTextIfChanged(this.sub, s.sub);
      var medal = I.PROFILE.medals[s.id] || 'none';
      var best = I.PROFILE.best[s.id] || 0;
      var m = s.medal;
      setTextIfChanged(this.detail,
        'MEDAL ' + medal.toUpperCase() + '   BEST ' + I.pad(best, 6) +
        '   GOLD: under ' + I.mmss(m.gold.time) + ' and ' + m.gold.ore + ' ore');
      setTextIfChanged(this.salvageText,
        'SALVAGE  ' + (I.PROFILE.salvage || 0) + '   ·   REFIT BEFORE DEPLOY');
      for (var ri = 0; ri < this.refitBtns.length; ri++) {
        var id = D.REFIT_ORDER[ri], ref = D.refit(id), level = I.PROFILE.refits[id] || 0;
        var cost = level >= ref.max ? 'MAX' : D.refitCost(id, level) + ' S';
        this.refitBtns[ri].setText(ref.short + '  LV' + level);
        this.refitBtns[ri].setSub(level >= ref.max ? 'MAX' : cost);
        this.refitBtns[ri].setEnabled(level < ref.max && (I.PROFILE.salvage || 0) >= D.refitCost(id, level));
      }
      setTextIfChanged(this.lockNote, unlocked ? '' :
        'LOCKED. Clear ' + D.sectorAt(this.pick - 1).name + ' to open this sector.');
      this.startBtn.setEnabled(unlocked);
      this.startBtn.setText(unlocked ? 'DEPLOY' : 'LOCKED');
      HB.sector = this.pick + 1;
      HB.sectorId = s.id;
      HB.sectorName = s.name;
      HB.family = s.family;
      HB.salvage = I.PROFILE.salvage || 0;
      HB.refits = {
        hull: I.PROFILE.refits.hull, coil: I.PROFILE.refits.coil,
        drive: I.PROFILE.refits.drive, magnet: I.PROFILE.refits.magnet
      };
    },
    layout: function () {
      var W = this.scale.width, H = this.scale.height;
      var ins = I.safeInsets();
      this.sky.resize(W, H);
      var sc = clamp(Math.min(W / 900, H / 480), 0.62, 1.25);
      this.title.setPosition(W / 2, ins.t + 34 * sc).setFontSize(Math.round(20 * sc));
      this.name.setPosition(W / 2, H * 0.30).setFontSize(Math.round(30 * sc));
      this.sub.setPosition(W / 2, H * 0.30 + 30 * sc).setFontSize(Math.round(14 * sc));
      this.detail.setPosition(W / 2, H * 0.30 + 52 * sc).setFontSize(Math.round(13 * sc));
      this.lockNote.setPosition(W / 2, H * 0.30 + 74 * sc).setFontSize(Math.round(13 * sc));
      this.salvageText.setPosition(W / 2, H * 0.39).setFontSize(Math.max(14, Math.round(13 * sc)));
      var refitSpan = Math.min(W * 0.78, 88 * sc * this.refitBtns.length);
      for (var ri = 0; ri < this.refitBtns.length; ri++) {
        var rb = this.refitBtns[ri];
        rb.w = Math.round(78 * sc); rb.h = Math.round(42 * sc);
        rb.setPos(W / 2 - refitSpan / 2 + ri * (refitSpan / Math.max(1, this.refitBtns.length - 1)) - rb.w / 2,
          H * 0.43 - rb.h / 2);
      }

      var n = D.SECTORS.length;
      var span = Math.min(W * 0.82, 96 * sc * n);
      var y = H * 0.59;
      for (var i = 0; i < n; i++) {
        var x = W / 2 - span / 2 + span * (n === 1 ? 0.5 : i / (n - 1));
        this.nodeBtns[i].r = Math.round(26 * sc);
        this.nodeBtns[i].setPos(x, y);
        this.nodeLabels[i].setPosition(x, y + 40 * sc).setFontSize(Math.round(10 * sc));
      }
      this.startBtn.w = Math.round(Math.min(220, W * 0.34) * sc); this.startBtn.h = Math.round(58 * sc);
      this.ladderBtn.w = this.startBtn.w; this.ladderBtn.h = this.startBtn.h;
      var btnGap = Math.round(12 * sc);
      var btnTotal = this.startBtn.w + this.ladderBtn.w + btnGap;
      var btnY = H - ins.b - this.startBtn.h - 18 * sc;
      this.startBtn.setPos(W / 2 - btnTotal / 2, btnY);
      this.ladderBtn.setPos(W / 2 + btnTotal / 2 - this.ladderBtn.w, btnY);
      this.backBtn.r = Math.round(22 * sc);
      this.backBtn.setPos(ins.l + 34 * sc, ins.t + 34 * sc);
      this.setBtn.r = Math.round(22 * sc);
      this.setBtn.setPos(W - ins.r - 34 * sc, ins.t + 34 * sc);
      Tap.refreshRect();
    },
    update: function (time, delta) {
      var dt = Math.min(0.05, delta / 1000);
      this.sky.tick(dt, 10, 4);
      // keyboard: arrows pick, enter deploys
      if (kit.input.keyDown('ArrowRight') && !this.kr) { this.select(this.pick + 1); this.kr = true; }
      else if (!kit.input.keyDown('ArrowRight')) this.kr = false;
      if (kit.input.keyDown('ArrowLeft') && !this.kl) { this.select(this.pick - 1); this.kl = true; }
      else if (!kit.input.keyDown('ArrowLeft')) this.kl = false;
      if ((kit.input.keyDown('Enter') || kit.input.keyDown('Space')) && !this.ke) {
        this.ke = true; this.deploy();
      } else if (!kit.input.keyDown('Enter') && !kit.input.keyDown('Space')) this.ke = false;

      this.buttons.update(Tap.update());

      // node plates
      var g = this.nodesG;
      g.clear();
      var n = D.SECTORS.length, i;
      var unlocked = I.unlockedCount();
      for (i = 0; i < n - 1; i++) {
        var a = this.nodeBtns[i], b = this.nodeBtns[i + 1];
        g.lineStyle(3, i + 2 <= unlocked ? 0x4fc0e8 : 0x2a3d4a, i + 2 <= unlocked ? 0.7 : 0.5);
        g.beginPath(); g.moveTo(a.x + a.r, a.y); g.lineTo(b.x - b.r, b.y); g.strokePath();
      }
      for (i = 0; i < n; i++) {
        var nb = this.nodeBtns[i];
        var open = i + 1 <= unlocked;
        var med = I.PROFILE.medals[D.SECTORS[i].id] || 'none';
        nb.tint = open ? (D.MEDAL_TINT[med] || 0x5fd0f0) : 0x33475a;
        this.nodeLabels[i].setAlpha(open ? 1 : 0.4);
        if (i === this.pick) {
          g.lineStyle(3, 0xffffff, 0.9);
          g.strokeCircle(nb.x, nb.y, nb.r + 7);
        }
        if (!open) {
          g.fillStyle(0x0a141c, 0.55);
          g.fillCircle(nb.x, nb.y, nb.r);
        }
      }
      HB.mode = 'select';
      HB.unlocked = unlocked;
    }
  };

  window.HB_MENU = {
    Buttons: Buttons, slab: slab, pip: pip,
    TitleScene: TitleScene, SelectScene: SelectScene
  };
}());
