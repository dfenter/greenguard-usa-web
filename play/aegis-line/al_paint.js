/* Aegis Line - al_paint.js
 * The view half of the play scene: HUD construction, per-frame painting,
 * the incoming-fire tell, the burst cut-in, the tutorial strip, and the two
 * run-boundary screens. Merged into the same scene config as al_play.js.
 *
 * UI_LAW compliance lives here:
 *  - one persistent HUD line at the top, icons and meters instead of words
 *  - in-play events are corner chips, never banners
 *  - the 60 percent centre banner is only used at run boundaries
 *  - the tutorial is one thin fading strip, one line at a time
 *  - every touch target is at least 44 px and sits clear of the thumb zones
 */
(function (root) {
  'use strict';

  var AL = root.AL, D = root.ALData, ART = root.ALArt;
  var clamp = AL.clamp;
  var P = root.ALPlay;

  AL.buildChapterTextures = function (scene, key) {
    ART.buildChapter(scene, D.CHAPTER_BY_KEY[key] || D.CHAPTERS[0]);
  };

  var TUT_LINES = [
    'Hold anywhere to rise and fire',
    'Drag to aim. Recoil walks, pull back down',
    'Release to duck. Cover repairs while you are down',
    'Hit the glowing core for critical damage',
    'Tap when the ring reaches the marker to reload perfectly',
    'Tap a portrait when its gauge is full to fire a burst'
  ];

  function fix() {
    for (var i = 0; i < arguments.length; i++) {
      var o = arguments[i];
      if (o && o.setScrollFactor) o.setScrollFactor(0);
    }
  }
  function fixBtn(b) {
    fix(b.bg, b.text);
    if (b.iconImg) fix(b.iconImg);
    if (b.subText) fix(b.subText);
    return b;
  }

  var extra = {

    // =============================================================== HUD
    buildHud: function () {
      var scene = this;
      var C = AL.CSS;

      this.toast = AL.makeToast(this, 104);
      fix(this.toast.bg, this.toast.text, this.toast.icon);
      this.banner = AL.makeBanner(this, 140);
      fix(this.banner.plate, this.banner.title, this.banner.sub);

      // top strip: one compact line, everything else is a meter or an icon
      this.hudPlate = this.add.image(0, 0, 'atlas', 'plate').setOrigin(0, 0)
        .setDepth(98).setAlpha(0.55);
      this.icShield = this.add.image(0, 0, 'atlas', 'ic_shield').setOrigin(0, 0.5)
        .setDepth(101).setDisplaySize(17, 17).setTint(AL.PAL.green);
      this.intTrack = this.add.image(0, 0, 'atlas', 'track').setOrigin(0, 0.5).setDepth(100);
      this.intBar = this.add.image(0, 0, 'atlas', 'bar').setOrigin(0, 0.5).setDepth(101);
      this.intTxt = AL.txt(this, 0, 0, '100', 14, C.text, '700').setOrigin(0, 0.5).setDepth(101);

      this.icAmmo = this.add.image(0, 0, 'atlas', 'ic_ammo').setOrigin(0, 0.5)
        .setDepth(101).setDisplaySize(16, 16).setTint(AL.PAL.gold);
      this.ammoTxt = AL.txt(this, 0, 0, '0/0', 15, C.text, '700').setOrigin(0, 0.5).setDepth(101);

      this.stageTxt = AL.txt(this, 0, 0, '', 14, C.dim, '700').setOrigin(0.5, 0.5).setDepth(101);
      this.scoreTxt = AL.txt(this, 0, 0, '0', 17, C.gold, '700').setOrigin(1, 0.5).setDepth(101);

      this.wavePips = [];
      for (var i = 0; i < 8; i++) {
        this.wavePips.push(this.add.image(0, 0, 'atlas', 'dot').setOrigin(0.5)
          .setDepth(101).setDisplaySize(7, 7).setVisible(false));
      }

      // boss health, only present when a boss is on the field
      this.bossTrack = this.add.image(0, 0, 'atlas', 'track').setOrigin(0.5, 0.5)
        .setDepth(100).setVisible(false);
      this.bossBar = this.add.image(0, 0, 'atlas', 'bar').setOrigin(0, 0.5)
        .setDepth(101).setVisible(false).setTint(AL.PAL.red);
      this.bossTxt = AL.txt(this, 0, 0, '', 13, C.text, '700').setOrigin(0.5, 1)
        .setDepth(101).setVisible(false);

      // squad portraits: the only bottom-edge controls, 56 px plus slop
      this.portraits = [];
      for (var u = 0; u < this.units.length; u++) {
        var un = this.units[u];
        var g = {
          img: this.add.image(0, 0, 'atlas', 'por_' + un.id).setOrigin(0.5).setDepth(101),
          frameImg: this.add.image(0, 0, 'atlas', 'chip').setOrigin(0.5).setDepth(100),
          gaugeTrack: this.add.image(0, 0, 'atlas', 'track').setOrigin(0, 0.5).setDepth(102),
          gauge: this.add.image(0, 0, 'atlas', 'bar').setOrigin(0, 0.5).setDepth(103),
          ready: this.add.image(0, 0, 'atlas', 'ring_soft').setOrigin(0.5).setDepth(99)
            .setBlendMode(Phaser.BlendModes.ADD).setVisible(false),
          key: AL.txt(this, 0, 0, String(u + 1), 12, C.dim, '700').setOrigin(0.5).setDepth(103)
        };
        this.portraits.push(g);
      }

      // reload cue: a shrinking ring and a fixed window marker
      this.reloadRing = this.add.image(-500, -500, 'atlas', 'ring').setOrigin(0.5)
        .setDepth(71).setVisible(false);
      this.reloadWin = this.add.image(-500, -500, 'atlas', 'ring').setOrigin(0.5)
        .setDepth(70).setVisible(false).setTint(AL.PAL.green).setAlpha(0.7);

      // burst cut-in: a corner card, never a full-screen takeover, and it
      // never blocks input because nothing in this game takes canvas input
      this.cutPlate = this.add.image(0, 0, 'atlas', 'plate').setOrigin(0, 0.5)
        .setDepth(120).setVisible(false);
      this.cutPor = this.add.image(0, 0, 'atlas', 'por_venn').setOrigin(0, 0.5)
        .setDepth(121).setVisible(false);
      this.cutName = AL.txt(this, 0, 0, '', 18, C.gold, '700').setOrigin(0, 0.5)
        .setDepth(121).setVisible(false);

      // tutorial strip
      this.tutBg = this.add.image(0, 0, 'px').setOrigin(0, 0)
        .setDepth(106).setTint(0x081018).setAlpha(0).setVisible(false);
      this.tutTxt = AL.txt(this, 0, 0, '', 15, C.text, '700').setOrigin(0.5, 0.5)
        .setDepth(107).setAlpha(0).setVisible(false);

      // panels
      this.panel = this.add.nineslice(0, 0, 'atlas', 'plate', 128, 64, 22, 22, 22, 22)
        .setOrigin(0.5).setDepth(158).setVisible(false);
      this.panelDim = this.add.image(0, 0, 'px').setOrigin(0, 0)
        .setDepth(157).setTint(0x03060c).setAlpha(0).setVisible(false);
      this.panelTitle = AL.txt(this, 0, 0, '', 26, C.gold, '700').setOrigin(0.5, 0.5)
        .setDepth(159).setVisible(false);
      this.panelRows = [];
      for (var r = 0; r < 5; r++) {
        this.panelRows.push({
          l: AL.txt(this, 0, 0, '', 14, C.dim).setOrigin(0, 0.5).setDepth(159).setVisible(false),
          v: AL.txt(this, 0, 0, '', 15, C.text, '700').setOrigin(1, 0.5).setDepth(159).setVisible(false)
        });
      }
      this.panelStars = [];
      for (var s = 0; s < 3; s++) {
        this.panelStars.push(this.add.image(0, 0, 'atlas', 'ic_star').setOrigin(0.5)
          .setDepth(159).setDisplaySize(24, 24).setVisible(false));
      }

      // buttons: built once, toggled, never churned
      this.btnPause = fixBtn(this.addBtn({
        x: 0, y: 0, w: 46, h: 46, label: '', icon: 'ic_pause', iconSize: 18, depth: 102,
        onTap: function () { scene.openPause(); }
      }));
      this.btnResume = fixBtn(this.addBtn({
        x: 0, y: 0, w: 240, h: 46, label: 'RESUME', icon: 'ic_play', plate: true, depth: 160,
        tone: 'go', onTap: function () { scene.closePause(); }
      }));
      this.btnRestart = fixBtn(this.addBtn({
        x: 0, y: 0, w: 240, h: 46, label: 'RESTART', plate: true, depth: 160,
        onTap: function () { scene.closePause(); scene.restartRun(); }
      }));
      this.btnSettings = fixBtn(this.addBtn({
        x: 0, y: 0, w: 240, h: 46, label: 'SETTINGS', icon: 'ic_gear', plate: true, depth: 160,
        onTap: function () { AL.kit.openSettings(); }
      }));
      this.btnQuit = fixBtn(this.addBtn({
        x: 0, y: 0, w: 240, h: 46, label: 'COMMAND', plate: true, depth: 160,
        onTap: function () { scene.leaveTo('command'); }
      }));
      this.btnNext = fixBtn(this.addBtn({
        x: 0, y: 0, w: 200, h: 48, label: 'NEXT', plate: true, depth: 160, tone: 'go',
        onTap: function () { scene.advance(); }
      }));
      this.btnRetry = fixBtn(this.addBtn({
        x: 0, y: 0, w: 200, h: 48, label: 'RETRY', plate: true, depth: 160,
        onTap: function () { scene.restartRun(); }
      }));
      this.btnBack = fixBtn(this.addBtn({
        x: 0, y: 0, w: 200, h: 48, label: 'COMMAND', plate: true, depth: 160,
        onTap: function () { scene.leaveTo('command'); }
      }));

      fix(this.hudPlate, this.icShield, this.intTrack, this.intBar, this.intTxt,
        this.icAmmo, this.ammoTxt, this.stageTxt, this.scoreTxt,
        this.bossTrack, this.bossBar, this.bossTxt,
        this.reloadRing, this.reloadWin,
        this.cutPlate, this.cutPor, this.cutName,
        this.tutBg, this.tutTxt, this.panel, this.panelDim, this.panelTitle);
      for (var w2 = 0; w2 < this.wavePips.length; w2++) fix(this.wavePips[w2]);
      for (var p2 = 0; p2 < this.portraits.length; p2++) {
        var g2 = this.portraits[p2];
        fix(g2.img, g2.frameImg, g2.gaugeTrack, g2.gauge, g2.ready, g2.key);
      }
      for (var r2 = 0; r2 < this.panelRows.length; r2++) fix(this.panelRows[r2].l, this.panelRows[r2].v);
      for (var s2 = 0; s2 < this.panelStars.length; s2++) fix(this.panelStars[s2]);

      this.showPause(false);
      this.showPanel(false);
    },

    layoutHud: function () {
      var w = this.W, h = this.H, ins = this.ins;
      var y = ins.top + 24;
      var left = ins.left + 12;
      var right = w - ins.right - 12;

      this.hudPlate.setPosition(0, 0).setDisplaySize(w, ins.top + 46);
      this.btnPause.x = left + 23; this.btnPause.y = y; this.btnPause.layout();

      var x = left + 56;
      this.icShield.setPosition(x, y);
      x += 22;
      var barW = Math.min(150, Math.max(80, w * 0.19));
      this.intTrack.setPosition(x, y).setDisplaySize(barW, 11);
      this.intBar.setPosition(x + 1, y).setDisplaySize(barW - 2, 7);
      this.intTxt.setPosition(x + barW + 7, y);
      x += barW + 44;

      this.icAmmo.setPosition(x, y);
      this.ammoTxt.setPosition(x + 20, y);

      // The stage label is the first thing to go when the strip gets tight:
      // it is the only piece of text here that repeats every run.
      this.scoreTxt.setPosition(right, y);
      this.stageWide = w >= 720;
      this.stageTxt.setPosition(right - 92, y).setOrigin(1, 0.5);
      AL.setVis(this.stageTxt, this.stageWide);

      var pipY = ins.top + 42;
      for (var i = 0; i < this.wavePips.length; i++) {
        this.wavePips[i].setPosition(w * 0.5 - (this.plan.waves - 1) * 6 + i * 12, pipY);
      }

      this.bossTrack.setPosition(w * 0.5, ins.top + 60).setDisplaySize(w * 0.56, 11);
      this.bossBar.setPosition(w * 0.5 - w * 0.28 + 2, ins.top + 60).setDisplaySize(w * 0.56 - 4, 6);
      this.bossTxt.setPosition(w * 0.5, ins.top + 52);

      // portraits: bottom edge, centred, clear of both bottom corners
      var n = this.portraits.length;
      var size = Math.min(56, Math.max(44, (w * 0.62) / n - 10));
      var gap = 10;
      var totalW = n * size + (n - 1) * gap;
      var px = w * 0.5 - totalW / 2 + size / 2;
      var py = h - ins.bottom - size / 2 - 12;
      this.porSize = size;
      this.porY = py;
      this.porX0 = px;
      this.porStep = size + gap;
      for (var u = 0; u < n; u++) {
        var g = this.portraits[u];
        var gx = px + u * (size + gap);
        g.frameImg.setPosition(gx, py).setDisplaySize(size + 6, size + 6);
        g.img.setPosition(gx, py).setDisplaySize(size - 4, size - 4);
        g.gaugeTrack.setPosition(gx - size / 2 + 2, py + size / 2 - 4).setDisplaySize(size - 4, 7);
        g.gauge.setPosition(gx - size / 2 + 3, py + size / 2 - 4).setDisplaySize(size - 6, 4);
        g.ready.setPosition(gx, py).setDisplaySize(size * 1.9, size * 1.9);
        g.key.setPosition(gx, py - size / 2 - 8);
      }

      this.tutBg.setPosition(0, this.fieldTop).setDisplaySize(w, 34);
      this.tutTxt.setPosition(w * 0.5, this.fieldTop + 17);

      this.cutPlate.setPosition(ins.left + 10, h * 0.30).setDisplaySize(228, 82);
      this.cutPor.setPosition(ins.left + 20, h * 0.30).setDisplaySize(64, 64);
      this.cutName.setPosition(ins.left + 94, h * 0.30);

      this.panelDim.setPosition(0, 0).setDisplaySize(w, h);
      this.panel.setPosition(w * 0.5, h * 0.5).setSize(Math.min(420, w * 0.82), Math.min(300, h * 0.86));
      this.panelTitle.setPosition(w * 0.5, h * 0.5 - Math.min(150, h * 0.43) + 34);

      this.banner.layout(w, h);
      this.toast.anchor.x = right;
      this.toast.anchor.y = this.fieldTop + 46;

      this.layoutPanelBody();
    },

    layoutPanelBody: function () {
      var w = this.W, h = this.H;
      var pw = Math.min(420, w * 0.82), ph = Math.min(300, h * 0.86);
      var cx = w * 0.5, top = h * 0.5 - ph / 2;
      var rowY = top + 78;
      for (var i = 0; i < this.panelRows.length; i++) {
        this.panelRows[i].l.setPosition(cx - pw / 2 + 30, rowY + i * 24);
        this.panelRows[i].v.setPosition(cx + pw / 2 - 30, rowY + i * 24);
      }
      for (var s = 0; s < 3; s++) {
        this.panelStars[s].setPosition(cx - 34 + s * 34, top + 58);
      }
      var by = h * 0.5 + ph / 2 - 36;
      this.btnNext.x = cx - 106; this.btnNext.y = by; this.btnNext.w = 196; this.btnNext.layout();
      this.btnRetry.x = cx + 106; this.btnRetry.y = by; this.btnRetry.w = 196; this.btnRetry.layout();
      this.btnBack.x = cx; this.btnBack.y = by; this.btnBack.w = 196; this.btnBack.layout();

      var mb = h * 0.5 - 84;
      this.btnResume.x = cx; this.btnResume.y = mb; this.btnResume.layout();
      this.btnRestart.x = cx; this.btnRestart.y = mb + 56; this.btnRestart.layout();
      this.btnSettings.x = cx; this.btnSettings.y = mb + 112; this.btnSettings.layout();
      this.btnQuit.x = cx; this.btnQuit.y = mb + 168; this.btnQuit.layout();
    },

    portraitRect: function (i) {
      var s = this.porSize || 52;
      var x = (this.porX0 || 0) + i * (this.porStep || s + 10);
      var pad = Math.max(0, (44 - s) / 2) + 6;
      return { x: x - s / 2 - pad, y: (this.porY || 0) - s / 2 - pad, w: s + pad * 2, h: s + pad * 2 };
    },

    // ============================================================== paint
    paint: function (dt, j) {
      var i, e, p;
      var cam = this.cameras.main;
      if (j && AL.kit.juice.enabled && !AL.reducedMotion) cam.setScroll(-j.dx, -j.dy);
      else cam.setScroll(0, 0);

      this.bd.tick(dt, this.aim.x - this.cx);

      // ---- enemies
      var list = this.enemies.list;
      var chevN = 0;
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (!e.alive) continue;
        p = this.enemyScreen(e);
        var sc = p.sc;
        var alpha = 1;
        if (e.st === 'dying') {
          var k = 1 - e.dieT / 0.34;
          sc *= 1 + k * 0.28;
          alpha = 1 - k;
        }
        e.spr.setPosition(p.x, p.y).setScale(sc).setAlpha(alpha)
          .setDepth(20 + (1 - clamp(e.z, 0, 1)) * 18);
        this.setEnemyFrame(e, e.hurtT > 0 ? 'hurt' : (e.st === 'windup' ? 'windup' : 'idle'));
        if (e.boss) AL.setTint(e.spr, e.hurtT > 0 ? 0xffffff : 0xffffff);
        else AL.setTint(e.spr, e.stagT > 0 ? 0xbfd8ff : this.ch.enemyTint);

        // cores
        var showCores = e.st !== 'dying' && this.coresVisible(e);
        var bodyR = (D.ENEMIES[e.key] ? D.ENEMIES[e.key].r : (D.BOSSES[e.key] ? D.BOSSES[e.key].r : 16)) * sc;
        for (var c = 0; c < e.cores.length; c++) {
          var img = this.ensureCore(e, c);
          if (!showCores) { AL.setVis(img, false); continue; }
          var core = e.cores[c];
          var pulse = 1 + Math.sin(this.vclock * 6 + c * 1.7) * 0.14;
          var big = this.effects.sync > 0 ? 1.6 : 1;
          var r = core.r * sc * 2.6 * pulse * big;
          img.setPosition(p.x + core.x * sc, p.y + core.y * sc - bodyR * 0.9)
            .setDisplaySize(r, r).setAlpha(0.85 * alpha)
            .setDepth(21 + (1 - clamp(e.z, 0, 1)) * 18);
          AL.setVis(img, true);
        }

        // telegraph ring plus the chevron that names the threat
        if (e.st === 'windup') {
          var ring = this.ensureRing(e);
          var f = 1 - clamp(e.wind / Math.max(0.01, e.windMax), 0, 1);
          var rr = (bodyR * 5.4) * (1 - f * 0.62);
          ring.setPosition(p.x, p.y - bodyR * 0.9).setDisplaySize(rr, rr)
            .setAlpha(0.30 + f * 0.55).setVisible(true)
            .setTint(f > 0.7 ? 0xff5a4a : 0xffb066);
          if (chevN < this.chevs.length) {
            var ch = this.chevs[chevN++];
            ch.setPosition(clamp(p.x, 24, this.W - 24), this.coverTop - 4)
              .setVisible(true)
              .setDisplaySize(18 + f * 9, 18 + f * 9)
              .setAlpha(0.55 + f * 0.45)
              .setTint(f > 0.7 ? 0xff5a4a : 0xffd07a);
          }
        } else if (e.ring) e.ring.setVisible(false);
      }
      for (i = chevN; i < this.chevs.length; i++) AL.setVis(this.chevs[i], false);

      // ---- operators
      for (i = 0; i < this.units.length; i++) {
        var un = this.units[i];
        var oy = this.opY(un);
        var pose = un.reloading ? 'reload'
          : (un.muzzleT > 0 ? 'fire'
            : (this.hurtT > 0.18 && this.risen < 0.5 ? 'hit'
              : (this.risen > 0.5 ? 'rise' : 'duck')));
        var fr = 'op_' + un.id + '_' + pose;
        if (un.spr.frame.name !== fr) un.spr.setFrame(fr);
        un.spr.setPosition(un.postX, oy + (i === this.leadIdx ? 0 : 6))
          .setAlpha(i === this.leadIdx ? 1 : 0.9)
          .setScale(i === this.leadIdx ? 1 : 0.92);
        if (un.muzzleT > 0) {
          un.muzzle.setAlpha(un.muzzleT / 0.055);
        } else if (un.muzzle.visible) un.muzzle.setVisible(false);
      }

      // ---- tracers, shots, pops, rings
      var tl = this.tracers.list;
      for (i = 0; i < tl.length; i++) {
        var tr = tl[i];
        if (!tr.alive) continue;
        tr.t += dt;
        if (tr.t >= tr.life) { tr.alive = false; tr.spr.setVisible(false); continue; }
        tr.spr.setAlpha(1 - tr.t / tr.life);
      }
      var pl = this.pops.list;
      for (i = 0; i < pl.length; i++) {
        var po = pl[i];
        if (!po.alive) continue;
        po.t += dt;
        if (po.t >= po.life) { po.alive = false; po.txt.setVisible(false); continue; }
        var pt = po.t / po.life;
        po.y += po.vy * dt;
        po.vy *= 0.90;
        po.txt.setPosition(po.x, po.y).setAlpha(1 - pt * pt);
      }
      var rl = this.rings.list;
      for (i = 0; i < rl.length; i++) {
        var ri = rl[i];
        if (!ri.alive) continue;
        ri.t += dt;
        if (ri.t >= ri.life) { ri.alive = false; ri.spr.setVisible(false); continue; }
        var rt = ri.t / ri.life;
        var er = 1 - Math.pow(1 - rt, 3);
        var rad = ri.r0 + (ri.r1 - ri.r0) * er;
        ri.spr.setDisplaySize(rad, rad).setAlpha((1 - rt) * 0.85);
      }

      // ---- reticle, spread and the reload cue
      var lead = this.units[this.leadIdx];
      var ax = this.aim.x + this.recoil.x, ay = this.aim.y + this.recoil.y;
      this.reticle.setPosition(ax, ay)
        .setAlpha(this.risen > 0.4 ? 0.95 : 0.45)
        .setTint(this.perfectShots > 0 ? AL.PAL.green : 0xffffff);
      if (lead) {
        var spr2 = lead.stats.weapon.spread * (this.effects.volley > 0 ? 0.4 : 1);
        var sz = 26 + spr2 * 2.4;
        this.spreadRing.setPosition(ax, ay).setDisplaySize(sz, sz)
          .setAlpha(this.risen > 0.4 ? 0.26 : 0.1);
        if (lead.reloading) {
          var rp = 1 - lead.reloadT / lead.reloadTotal;
          var midWin = (0.55 + 0.78) / 2;
          var ringR = 96 - 74 * rp;
          var winRad = 96 - 74 * midWin;
          var inWin = rp >= 0.55 && rp <= 0.78 && !lead.perfectUsed;
          this.reloadRing.setPosition(ax, ay).setDisplaySize(ringR, ringR)
            .setVisible(true).setAlpha(0.9)
            .setTint(inWin ? AL.PAL.green : (lead.perfectUsed ? 0x8899aa : 0xffffff));
          this.reloadWin.setPosition(ax, ay).setDisplaySize(winRad, winRad)
            .setVisible(true).setAlpha(lead.perfectUsed ? 0.25 : 0.75);
        } else if (this.reloadRing.visible) {
          this.reloadRing.setVisible(false);
          this.reloadWin.setVisible(false);
        }
      }

      // ---- damage feedback
      // FILL RATE: both of these are full-screen quads and both are idle most
      // of the time. A quad at alpha 0 still costs a full-screen blend, so
      // they are switched off rather than faded to nothing.
      if (this.hurtT > 0) {
        AL.setVis(this.hitVig, true);
        this.hitVig.setAlpha(Math.min(0.55, this.hurtT * 1.5));
      } else if (this.hitVig.visible) {
        this.hitVig.setAlpha(0);
        AL.setVis(this.hitVig, false);
      }
      if (this.flash.alpha > 0.004) {
        AL.setVis(this.flash, true);
        this.flash.setAlpha(Math.max(0, this.flash.alpha - dt * 2.6));
      } else if (this.flash.visible) {
        this.flash.setAlpha(0);
        AL.setVis(this.flash, false);
      }

      this.paintHud(dt);
      this.paintCutin(dt);
      this.paintTutorial(dt);
      this.toast.tick(dt);
      this.banner.tick(dt);
      this.paintBtns(dt);
    },

    ensureCore: function (e, i) {
      if (!e.coreImgs[i]) {
        e.coreImgs[i] = this.add.image(-500, -500, 'atlas', 'core').setOrigin(0.5)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(30);
      }
      return e.coreImgs[i];
    },
    ensureRing: function (e) {
      if (!e.ring) {
        e.ring = this.add.image(-500, -500, 'atlas', 'ring_soft').setOrigin(0.5)
          .setBlendMode(Phaser.BlendModes.ADD).setDepth(19);
      }
      return e.ring;
    },

    paintHud: function (dt) {
      var lead = this.units[this.leadIdx];
      var iw = Math.min(150, Math.max(80, this.W * 0.19)) - 2;
      var f = clamp(this.integrity / this.maxIntegrity, 0, 1);
      this.intBar.setDisplaySize(Math.max(1, iw * f), 7);
      var col = f > 0.55 ? AL.PAL.green : f > 0.28 ? AL.PAL.gold : AL.PAL.red;
      AL.setTint(this.intBar, col);
      AL.setTint(this.icShield, col);
      AL.setTxt(this.intTxt, String(Math.ceil(this.integrity)));
      AL.setCol(this.intTxt, f > 0.28 ? AL.CSS.text : AL.CSS.red);

      if (lead) {
        AL.setTxt(this.ammoTxt, lead.reloading ? '- -' : (lead.ammo + '/' + lead.mag));
        AL.setCol(this.ammoTxt, lead.reloading ? AL.CSS.dim
          : (lead.ammo <= lead.mag * 0.25 ? AL.CSS.red : AL.CSS.text));
        AL.setTint(this.icAmmo, lead.reloading ? 0x8fa8bd : AL.PAL.gold);
      }
      AL.setTxt(this.scoreTxt, AL.fmt(this.score));
      if (this.stageWide) AL.setTxt(this.stageTxt, this.plan.name);

      for (var i = 0; i < this.wavePips.length; i++) {
        var on = i < this.plan.waves;
        AL.setVis(this.wavePips[i], on && this.plan.waves > 1);
        if (on) {
          AL.setTint(this.wavePips[i], i < this.waveIdx ? AL.PAL.gold : 0x3f5668);
          this.wavePips[i].setAlpha(i < this.waveIdx ? 0.95 : 0.5);
        }
      }

      var boss = this.bossRec;
      var bossOn = !!(boss && boss.alive && boss.st !== 'dying');
      AL.setVis(this.bossTrack, bossOn);
      AL.setVis(this.bossBar, bossOn);
      AL.setVis(this.bossTxt, bossOn);
      if (bossOn) {
        var bf = clamp(boss.hp / boss.maxHp, 0, 1);
        this.bossBar.setDisplaySize(Math.max(1, (this.W * 0.56 - 4) * bf), 6);
        AL.setTxt(this.bossTxt, (D.BOSSES[boss.key] || D.BOSSES.titan).name);
      }

      for (var u = 0; u < this.portraits.length; u++) {
        var g = this.portraits[u];
        var un = this.units[u];
        var gf = clamp(un.gauge / un.cost, 0, 1);
        var ready = gf >= 1;
        g.gauge.setDisplaySize(Math.max(1, (this.porSize - 6) * gf), 4);
        AL.setTint(g.gauge, ready ? AL.PAL.gold : un.stats.unit.color);
        AL.setTint(g.frameImg, u === this.leadIdx ? AL.PAL.gold : 0x9fb4c6);
        g.frameImg.setAlpha(u === this.leadIdx ? 1 : 0.7);
        g.img.setAlpha(ready ? 1 : 0.86);
        AL.setVis(g.ready, ready);
        if (ready) {
          var pulse = 0.5 + 0.5 * Math.sin(this.vclock * 5);
          g.ready.setAlpha(0.30 + pulse * 0.35).setTint(AL.PAL.gold);
        }
        AL.setVis(g.key, this.W > 640);
      }
    },

    paintCutin: function (dt) {
      var on = this.cutin.t > 0;
      AL.setVis(this.cutPlate, on);
      AL.setVis(this.cutPor, on);
      AL.setVis(this.cutName, on);
      if (!on) return;
      var t = 1 - this.cutin.t / 0.85;
      var slide = t < 0.18 ? (t / 0.18) : (t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1);
      if (AL.reducedMotion) slide = t < 0.9 ? 1 : 0;
      var dx = (1 - slide) * -240;
      var u = D.SQUAD_BY_ID[this.cutin.id] || D.SQUAD[0];
      var fr = 'por_' + u.id;
      if (this.cutPor.frame.name !== fr) this.cutPor.setFrame(fr);
      AL.setTxt(this.cutName, this.cutin.name);
      AL.setCol(this.cutName, '#' + ('00000' + u.alt.toString(16)).slice(-6));
      this.cutPlate.setPosition(this.ins.left + 10 + dx, this.H * 0.30).setAlpha(0.94 * slide);
      this.cutPor.setPosition(this.ins.left + 20 + dx, this.H * 0.30).setAlpha(slide);
      this.cutName.setPosition(this.ins.left + 94 + dx, this.H * 0.30).setAlpha(slide);
    },

    paintTutorial: function (dt) {
      var t = this.tut;
      if (!t || t.done) {
        if (this.tutBg.visible) { AL.setVis(this.tutBg, false); AL.setVis(this.tutTxt, false); }
        return;
      }
      var line = TUT_LINES[clamp(t.step, 0, TUT_LINES.length - 1)] || '';
      AL.setTxt(this.tutTxt, line);
      AL.setVis(this.tutBg, true);
      AL.setVis(this.tutTxt, true);
      // one line, fading to near transparent after roughly three seconds
      var a = t.t < 3 ? 1 : Math.max(0.22, 1 - (t.t - 3) * 0.5);
      this.tutBg.setAlpha(0.62 * a);
      this.tutTxt.setAlpha(a);
    },

    // ====================================================== run boundary
    startBanner: function () {
      var scene = this;
      this.phase = 'intro';
      AL.state.phase = 'intro';
      var kindLabel = this.plan.kind === 'boss' ? 'BOSS' : this.plan.kind === 'elite' ? 'ELITE' : '';
      var sub = this.plan.sub + (kindLabel ? '   ' + kindLabel : '');
      this.banner.show(this.plan.name, sub, AL.CSS.gold, 1.9, function () {
        scene.beginFight();
      });
    },

    winStage: function () {
      if (this.phase !== 'fight') return;
      this.phase = 'clear';
      AL.state.phase = 'clear';
      AL.kit.audio.sfx('sfx_clear', { volume: 0.9 });
      AL.kit.audio.music('music_command', 900);
      this.holding = false;

      var stars = 1;
      if (this.damageTaken <= 0.01) stars = 3;
      else if (this.damageTaken < this.maxIntegrity * 0.45) stars = 2;
      this.stageStars = stars;

      // rewards, full on a first clear and reduced on a repeat
      var save = AL.save;
      var first = false;
      var credits = this.plan.credits, cores = this.plan.cores;
      if (this.mode === 'campaign') {
        first = this.index >= save.cleared;
        if (first) save.cleared = Math.min(D.STAGES.length, this.index + 1);
        var key = String(this.index);
        if (!save.stars[key] || save.stars[key] < stars) save.stars[key] = stars;
      } else if (this.mode === 'tower') {
        first = this.index >= save.towerBest;
        if (first) save.towerBest = Math.min(D.TOWER.length, this.index + 1);
      } else {
        var stamp = D.todayStamp();
        first = save.daily.date !== stamp;
        save.daily.date = stamp;
        save.daily.best = Math.max(save.daily.best || 0, Math.round(this.score));
        save.daily.runs = (save.daily.runs || 0) + 1;
      }
      if (!first) { credits = Math.round(credits * 0.4); cores = 0; }
      credits += Math.round(this.score * 0.02);
      save.credits = clamp(save.credits + credits, 0, 9999999);
      save.cores = clamp(save.cores + cores, 0, 99999);
      save.bestScore = Math.max(save.bestScore || 0, Math.round(this.score));
      save.totalKills = Math.min(9999999, (save.totalKills || 0) + this.kills);
      AL.normalise(save);
      AL.persist();

      // newly unlocked squad members are announced, not buried
      var newIds = D.unlockedIdsFor(save.cleared);
      for (var i = 0; i < newIds.length; i++) {
        if (D.SQUAD_BY_ID[newIds[i]].unlock === save.cleared && save.cleared > 0) {
          this.toast.push(D.SQUAD_BY_ID[newIds[i]].name + ' JOINS', 'ic_star', AL.PAL.gold);
          AL.kit.audio.sfx('sfx_unlock', { volume: 0.9 });
        }
      }

      this.results = { win: true, credits: credits, cores: cores, stars: stars };
      var scene = this;
      this.banner.show('LINE HELD', this.plan.name, AL.CSS.green, 1.7, function () {
        scene.showResults();
      });
    },

    loseStage: function () {
      if (this.phase !== 'fight') return;
      this.phase = 'fail';
      AL.state.phase = 'fail';
      this.holding = false;
      AL.kit.audio.sfx('sfx_fail', { volume: 0.9 });
      AL.kit.audio.music('music_command', 900);
      if (AL.kit.juice.enabled) AL.kit.juice.shake(10, 420);
      this.flashScreen(0.4);
      var credits = Math.round(this.score * 0.01);
      AL.save.credits = clamp(AL.save.credits + credits, 0, 9999999);
      AL.save.bestScore = Math.max(AL.save.bestScore || 0, Math.round(this.score));
      AL.persist();
      this.results = { win: false, credits: credits, cores: 0, stars: 0 };
      var scene = this;
      this.banner.show('LINE BROKEN', this.plan.name, AL.CSS.red, 1.7, function () {
        scene.showResults();
      });
    },

    showResults: function () {
      var r = this.results;
      if (!r) return;
      this.showPanel(true);
      AL.setTxt(this.panelTitle, r.win ? 'STAGE CLEAR' : 'DEFEAT');
      AL.setCol(this.panelTitle, r.win ? AL.CSS.green : AL.CSS.red);
      var rows = [
        ['SCORE', AL.fmt(this.score)],
        ['KILLS', String(this.kills)],
        ['WEAK POINTS', String(this.crits)],
        ['CREDITS', '+' + AL.fmt(r.credits)],
        ['CORES', '+' + r.cores]
      ];
      for (var i = 0; i < this.panelRows.length; i++) {
        var row = this.panelRows[i];
        AL.setVis(row.l, true);
        AL.setVis(row.v, true);
        AL.setTxt(row.l, rows[i][0]);
        AL.setTxt(row.v, rows[i][1]);
      }
      for (var s = 0; s < 3; s++) {
        AL.setVis(this.panelStars[s], r.win);
        AL.setTint(this.panelStars[s], s < r.stars ? AL.PAL.gold : 0x33455a);
        this.panelStars[s].setAlpha(s < r.stars ? 1 : 0.5);
      }
      var canAdvance = r.win && this.nextIndex() !== -1;
      this.btnNext.setVisible(canAdvance);
      this.btnRetry.setVisible(true);
      this.btnBack.setVisible(!canAdvance);
      if (canAdvance) {
        this.btnRetry.x = this.W * 0.5 + 106;
        this.btnNext.x = this.W * 0.5 - 106;
      } else {
        this.btnRetry.x = this.W * 0.5 - 106;
        this.btnBack.x = this.W * 0.5 + 106;
      }
      this.btnRetry.layout(); this.btnNext.layout(); this.btnBack.layout();
      this.btnPause.setVisible(false);
    },

    nextIndex: function () {
      if (this.mode === 'campaign') {
        return (this.index + 1 < D.STAGES.length && this.index + 1 <= AL.save.cleared) ? this.index + 1 : -1;
      }
      if (this.mode === 'tower') {
        return (this.index + 1 < D.TOWER.length && this.index + 1 <= AL.save.towerBest) ? this.index + 1 : -1;
      }
      return -1;
    },

    advance: function () {
      var n = this.nextIndex();
      if (n === -1) { this.leaveTo('command'); return; }
      this.scene.restart({ mode: this.mode, index: n });
    },

    restartRun: function () {
      this.scene.restart({ mode: this.mode, index: this.index });
    },

    leaveTo: function (key) {
      AL.onPause = null; AL.onResume = null; AL.onRestart = null; AL.onRawKey = null;
      AL.kit.audio.music('music_command', 800);
      this.scene.start(key);
    },

    showPanel: function (on) {
      AL.setVis(this.panel, on);
      AL.setVis(this.panelDim, on);
      this.panelDim.setAlpha(on ? 0.72 : 0);
      AL.setVis(this.panelTitle, on);
      for (var i = 0; i < this.panelRows.length; i++) {
        AL.setVis(this.panelRows[i].l, on);
        AL.setVis(this.panelRows[i].v, on);
      }
      for (var s = 0; s < 3; s++) AL.setVis(this.panelStars[s], on);
      if (!on) {
        this.btnNext.setVisible(false);
        this.btnRetry.setVisible(false);
        this.btnBack.setVisible(false);
      }
    },

    showPause: function (on) {
      this.btnResume.setVisible(on);
      this.btnRestart.setVisible(on);
      this.btnSettings.setVisible(on);
      this.btnQuit.setVisible(on);
      if (on) {
        AL.setVis(this.panelDim, true);
        this.panelDim.setAlpha(0.78);
        AL.setVis(this.panelTitle, true);
        AL.setTxt(this.panelTitle, 'PAUSED');
        AL.setCol(this.panelTitle, AL.CSS.gold);
        this.panelTitle.setPosition(this.W * 0.5, this.H * 0.5 - 150);
      } else if (!this.results) {
        AL.setVis(this.panelDim, false);
        AL.setVis(this.panelTitle, false);
      }
    },

    openPause: function () {
      if (this.pauseOpen || this.results) return;
      this.pauseOpen = true;
      this.showPause(true);
      this.btnPause.setVisible(false);
      AL.kit.pause('menu');
    },

    closePause: function () {
      if (!this.pauseOpen) return;
      this.pauseOpen = false;
      this.showPause(false);
      this.btnPause.setVisible(true);
      AL.clearTaps();
      AL.kit.resume('menu');
    }
  };

  for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) P[k] = extra[k];
})(typeof window !== 'undefined' ? window : globalThis);
