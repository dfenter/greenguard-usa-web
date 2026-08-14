/* hb_hud.js — Hullbreaker presentation: particle systems, the in-field
 * HUD and controls, banner beats, the upgrade and results overlays, the
 * coach strip, and the paint pass. Appends onto HB_PLAY.PLAY, then boots.
 */
(function () {
  'use strict';

  var I = window.HB_INTERNAL;
  var D = window.HB_DATA;
  var M = window.HB_MENU;
  var PLAY = window.HB_PLAY.PLAY;
  var kit = I.kit, Tap = I.Tap, HB = I.HB_STATE, Game = I.Game;
  var clamp = I.clamp, txt = I.txt, tex = I.tex;
  var setTextIfChanged = I.setTextIfChanged, fxCount = I.fxCount;
  var setColorIfChanged = I.setColorIfChanged;
  var TAU = Math.PI * 2;

  function hex(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }

  function weaponMark(id) {
    return id === 'pulse' ? 'PUL' : id === 'spread' ? 'SPR' :
      id === 'laser' ? 'LNC' : id === 'homing' ? 'POD' : '---';
  }

  // Phaser's Graphics.arc walks the sweep in 0.01 rad steps, which is ~470
  // segments for a 270-degree ring and was the single most expensive thing
  // in the per-frame HUD. These rings are 40 px across; 22 segments is
  // indistinguishable and roughly twenty times cheaper.
  function arcPath(g, cx, cy, r, a0, a1, segs) {
    var n = segs || 22;
    var step = (a1 - a0) / n;
    g.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = a0 + step * i;
      var x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokePath();
  }

  // ======================================================================
  // particle systems (6, all pooled by Phaser, all count-gated)
  // ======================================================================
  PLAY.buildFx = function () {
    this.fx = {};
    // 1. engine exhaust ribbon
    this.fx.exhaust = this.add.particles(0, 0, I.frameOwner('p_streak') || '__missing', {
      frame: 'p_streak',
      lifespan: 320, speed: { min: 6, max: 40 }, scale: { start: 0.34, end: 0 },
      alpha: { start: 0.8, end: 0 }, blendMode: 'ADD', emitting: false,
      quantity: 1, maxAliveParticles: 60, tint: 0x8fe8ff
    }).setDepth(37);
    // 2. muzzle and impact sparks
    this.fx.spark = this.add.particles(0, 0, I.frameOwner('p_spark') || '__missing', {
      frame: 'p_spark',
      lifespan: 420, speed: { min: 60, max: 280 }, scale: { start: 0.26, end: 0 },
      alpha: { start: 1, end: 0 }, blendMode: 'ADD', emitting: false,
      quantity: 6, maxAliveParticles: 96
    }).setDepth(46);
    // 3. rock shards (NORMAL blend so debris reads as matter, not light)
    this.fx.shard = this.add.particles(0, 0, I.frameOwner('p_shard') || '__missing', {
      frame: 'p_shard',
      lifespan: 900, speed: { min: 50, max: 260 }, scale: { start: 0.34, end: 0.06 },
      alpha: { start: 1, end: 0.05 }, rotate: { start: 0, end: 360 },
      blendMode: 'NORMAL', emitting: false, quantity: 8, maxAliveParticles: 90
    }).setDepth(44);
    // 4. dust cloud
    this.fx.dust = this.add.particles(0, 0, I.frameOwner('p_smoke') || '__missing', {
      frame: 'p_smoke',
      lifespan: 1100, speed: { min: 8, max: 60 }, scale: { start: 0.22, end: 0.7 },
      alpha: { start: 0.5, end: 0 }, blendMode: 'NORMAL', emitting: false,
      quantity: 4, maxAliveParticles: 32, tint: 0x8fa2b2
    }).setDepth(43);
    // 5. ore sparkle trail
    this.fx.sparkle = this.add.particles(0, 0, I.frameOwner('p_dust') || '__missing', {
      frame: 'p_dust',
      lifespan: 520, speed: { min: 4, max: 34 }, scale: { start: 0.6, end: 0 },
      alpha: { start: 0.95, end: 0 }, blendMode: 'ADD', emitting: false,
      quantity: 1, maxAliveParticles: 64, tint: 0x8ff2c8
    }).setDepth(45);
    // 6. shock ring
    this.fx.ring = this.add.particles(0, 0, I.frameOwner('p_ring') || '__missing', {
      frame: 'p_ring',
      lifespan: 480, speed: 0, scale: { start: 0.08, end: 0.9 },
      alpha: { start: 0.75, end: 0 }, blendMode: 'ADD', emitting: false,
      quantity: 1, maxAliveParticles: 24
    }).setDepth(47);
  };

  function emit(em, x, y, n, tint) {
    if (!em) return;
    if (tint != null) em.setParticleTint(tint);
    em.emitParticleAt(x, y, fxCount(n));
  }

  PLAY.muzzle = function (x, y, tint) { emit(this.fx.spark, x, y, 3, tint); };
  PLAY.chipSpark = function (x, y, tint) { emit(this.fx.spark, x, y, 3, tint); };
  PLAY.dustPuff = function (x, y, tint, n) { emit(this.fx.dust, x, y, n || 3, tint); };
  PLAY.oreSparkle = function (p) {
    emit(this.fx.sparkle, p.x, p.y, 1, D.pickup(p.kind).tint);
  };
  PLAY.cometTrail = function (r) {
    emit(this.fx.exhaust, r.x, r.y, 2, D.family(r.fam).shard);
  };
  // Ore is collected constantly, so its pop is deliberately cheap; only the
  // rarer pickups pay for a shock ring.
  PLAY.pickupBurst = function (x, y, tint, big) {
    emit(this.fx.sparkle, x, y, big ? 10 : 4, tint);
    if (big) emit(this.fx.ring, x, y, 1, tint);
  };
  PLAY.dashBurst = function (x, y) {
    emit(this.fx.ring, x, y, 1, 0xffd07a);
    emit(this.fx.spark, x, y, 12, 0xffd07a);
  };
  PLAY.ventBurst = function () {
    var s = this.ship;
    emit(this.fx.dust, s.x, s.y, 8, 0xdfe9f2);
    emit(this.fx.ring, s.x, s.y, 1, 0xff9a6a);
  };
  PLAY.shieldBurst = function (x, y) {
    emit(this.fx.ring, x, y, 1, 0x7fd8ff);
    emit(this.fx.spark, x, y, 16, 0x9fe8ff);
  };
  PLAY.fracture = function (x, y, sizeKey, fam) {
    var n = sizeKey === 'large' ? 20 : (sizeKey === 'med' ? 13 : 8);
    emit(this.fx.shard, x, y, n, fam.shard);
    emit(this.fx.dust, x, y, sizeKey === 'small' ? 2 : 5, fam.dust);
    emit(this.fx.ring, x, y, 1, fam.tint);
    if (sizeKey !== 'small') emit(this.fx.spark, x, y, 8, fam.shard);
  };
  PLAY.bigBoom = function (x, y, tint) {
    emit(this.fx.ring, x, y, 1, tint);
    emit(this.fx.spark, x, y, 26, tint);
    emit(this.fx.shard, x, y, 16, tint);
    emit(this.fx.dust, x, y, 8, 0x9aa8b8);
  };
  PLAY.popText = function (x, y, s, tint) {
    // Score is already legible in the score meter. Only named pickups get a
    // compact edge toast; world-space pop stacks obscure the field.
    if (String(s || '').charAt(0) !== '+') this.queueToast(s, tint);
  };

  // ======================================================================
  // HUD
  // ======================================================================
  PLAY.buildHud = function () {
    var d = 70;
    // Graphics geometry is rebuilt on every clear(), which is the single
    // most expensive thing a HUD can do per frame. The plates that only
    // change when a value changes live on their own layers behind a
    // signature check; only the arcs and the stick are redrawn each frame.
    this.hudG = this.add.graphics().setDepth(d);
    this.hudSig = '';
    this.ctlG = this.add.graphics().setDepth(d - 4);
    this.ctlPlateG = this.add.graphics().setDepth(d - 5);
    this.ctlSig = '';
    this.vignette = this.add.graphics().setDepth(d + 6);
    this.beamG = this.add.graphics().setDepth(41);
    this.driftG = this.add.graphics().setDepth(33);

    this.hudT = {
      sector: txt(this, 0, 0, '', 15, '#dff4ff', '800'),
      wave: txt(this, 0, 0, '', 14, '#7fb0c6', '700'),
      timer: txt(this, 0, 0, '', 14, '#8fc0d4', '700').setOrigin(1, 0),
      score: txt(this, 0, 0, '', 19, '#eaf9ff', '800').setOrigin(1, 0),
      ore: txt(this, 0, 0, '', 14, '#7ef0b4', '700').setOrigin(1, 0),
      objective: txt(this, 0, 0, '', 14, '#ffd76a', '700').setOrigin(0.5)
    };
    for (var k in this.hudT) this.hudT[k].setDepth(d + 1);

    this.chipT = [];
    for (var i = 0; i < 4; i++) {
      this.chipT.push(txt(this, -999, -999, '', 14, '#cfe9f6', '800')
        .setOrigin(0.5).setDepth(d + 1));
    }

    this.hudBtn = {
      pause: { x: 0, y: 0, r: 20 },
      fire: { x: 0, y: 0, r: 56 },
      dash: { x: 0, y: 0, r: 38 },
      chips: [{ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 },
              { x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 10, h: 10 }]
    };

    // Center banners are reserved for run-boundary presentation only.
    this.bannerG = this.add.graphics().setDepth(d + 10);
    this.bannerTitle = txt(this, 0, 0, '', 26, '#ffffff', '800').setOrigin(0.5).setDepth(d + 11);
    this.bannerSub = txt(this, 0, 0, '', 14, '#bfe0ef', '600').setOrigin(0.5).setDepth(d + 11);
    this.banner = { t: 0, life: 0, x: 0, tint: 0x6fe0ff, alpha: 0 };

    // One tutorial strip, kept at the top edge and never over the controls.
    this.coachG = this.add.graphics().setDepth(d + 8);
    this.coachT = txt(this, 0, 0, '', 14, '#eaf9ff', '700').setOrigin(0.5).setDepth(d + 9);
    this.coachAlpha = 0;

    // All in-play event copy shares one small edge toast and a short queue.
    this.toastG = this.add.graphics().setDepth(d + 12);
    this.toastT = txt(this, 0, 0, '', 14, '#eaf9ff', '800')
      .setOrigin(0, 0.5).setDepth(d + 13).setVisible(false);
    this.toast = null;
    this.toastQueue = [];

    // overlay layer for upgrade and results
    this.overlayG = this.add.graphics().setDepth(90);
    this.overlayBtns = new M.Buttons(this);
    this.overlayText = [];
    this.overlayOpen = false;
  };

  PLAY.layoutHud = function () {
    var W = this.W, H = this.H, ins = this.ins, s = this.uiScale;
    var t = this.hudT;
    var top = ins.t + 12 * s;
    var minRead = function (n) { return Math.max(14, Math.round(n * s)); };
    var edge = Math.max(16, Math.round(18 * s));
    t.sector.setPosition(ins.l + edge, top).setFontSize(minRead(15));
    t.wave.setPosition(ins.l + edge, top + 20 * s).setFontSize(minRead(14));
    this.hudBtn.pause.r = Math.max(22, Math.round(22 * s));
    var right = W - ins.r - Math.max(16, Math.round(16 * s));
    this.hudBtn.pause.x = right - this.hudBtn.pause.r;
    this.hudBtn.pause.y = top + 18 * s;
    var statRight = this.hudBtn.pause.x - this.hudBtn.pause.r -
      Math.max(16, Math.round(16 * s));
    t.score.setPosition(statRight, top).setFontSize(minRead(19));
    t.ore.setPosition(statRight, top + 23 * s).setFontSize(minRead(14));
    t.timer.setPosition(statRight, top + 44 * s).setFontSize(minRead(14));
    // the wave pip row and the shield row own their own bands so neither can
    // ever land on top of a readout
    this.hudY = { pips: top + 42 * s, shields: top + 63 * s };

    this.hudBtn.fire.r = Math.round(clamp(56 * s, 44, 74));
    this.hudBtn.fire.x = W - ins.r - this.hudBtn.fire.r - 26 * s;
    this.hudBtn.fire.y = H - ins.b - this.hudBtn.fire.r - 24 * s;

    this.hudBtn.dash.r = Math.round(clamp(38 * s, 30, 50));
    this.hudBtn.dash.x = this.hudBtn.fire.x - this.hudBtn.fire.r - this.hudBtn.dash.r - 14 * s;
    this.hudBtn.dash.y = this.hudBtn.fire.y - 6 * s;

    t.objective.setPosition(W / 2, ins.t + 57 * s).setFontSize(minRead(14));
    this.layoutChips();

    this.bannerTitle.setFontSize(Math.max(24, Math.round(26 * s)));
    this.bannerSub.setFontSize(minRead(14));
    this.coachT.setFontSize(minRead(14));
    this.toastT.setFontSize(minRead(14));
    if (this.overlayOpen) this.layoutOverlay();
  };

  // Weapon buttons live at the top edge, away from the thumb zones. They keep
  // a 44px hit box even on the smallest supported viewport.
  PLAY.layoutChips = function () {
    var s = this.uiScale, W = this.W, ins = this.ins;
    var n = this.weapons && this.weapons.length > 1 ? clamp(this.weapons.length, 2, 4) : 0;
    var cw = 44, ch = 44, gap = Math.max(4, Math.round(5 * s));
    var cols = W < 560 ? 2 : Math.max(1, n);
    var top = ins.t + Math.max(62, Math.round(68 * s));
    var right = W - ins.r - Math.max(16, Math.round(16 * s));
    for (var i = 0; i < 4; i++) {
      var c = this.hudBtn.chips[i];
      c.w = cw; c.h = ch;
      var col = cols ? i % cols : 0;
      var row = cols ? Math.floor(i / cols) : 0;
      c.x = right - (cols - col) * cw - (cols - col - 1) * gap;
      c.y = top + row * (ch + gap);
      this.chipT[i].setPosition(c.x + cw / 2, c.y + ch / 2)
        .setFontSize(Math.max(14, Math.round(14 * s)));
    }
  };

  PLAY.weaponChipAt = function (p) {
    if (!this.weapons || this.weapons.length < 2 || (this.tut && !this.tut.done)) return -1;
    for (var i = 0; i < this.hudBtn.chips.length; i++) {
      if (i >= this.weapons.length) break;
      if (I.inRect(p, this.hudBtn.chips[i])) return i;
    }
    return -1;
  };

  // ======================================================================
  // transient edge toast and boundary banner
  // ======================================================================
  PLAY.clearToast = function () {
    this.toast = null;
    this.toastQueue.length = 0;
    this.toastG.clear();
    this.toastT.setVisible(false);
  };

  PLAY.queueToast = function (text, tint, hold) {
    if (!text || (this.tut && !this.tut.done)) return;
    var item = { text: String(text), tint: tint || 0x6fe0ff, t: hold || 1.0 };
    if (!this.toast) this.toast = item;
    else if (this.toast.text === item.text) this.toast.t = Math.max(this.toast.t, item.t);
    else if (this.toastQueue.length < 5) this.toastQueue.push(item);
  };

  PLAY.showBanner = function (title, sub, tint, life) {
    // A banner is deliberately a run-boundary primitive. Any live toast is
    // dismissed before the medal/run-end presentation starts.
    this.clearToast();
    var b = this.banner;
    b.life = life || 2.1;
    b.t = b.life;
    b.tint = tint || 0x6fe0ff;
    setTextIfChanged(this.bannerTitle, title || '');
    setTextIfChanged(this.bannerSub, sub || '');
    var W = this.W || 800;
    if (I.isReduced()) {
      b.x = W / 2;
      b.alpha = 0;
      this.tweens.add({ targets: b, alpha: 1, duration: 220 });
    } else {
      b.x = -W * 0.5;
      b.alpha = 1;
      this.tweens.add({ targets: b, x: W / 2, duration: 520, ease: 'Back.easeOut' });
    }
    kit.audio.sfx('banner', { volume: 0.55 });
  };

  PLAY.paintBanner = function (dt) {
    var b = this.banner;
    var g = this.bannerG;
    g.clear();
    if (b.t <= 0 || this.overlayOpen ||
        (this.mode !== 'results' && this.mode !== 'gameover')) {
      this.bannerTitle.setVisible(false);
      this.bannerSub.setVisible(false);
      return;
    }
    b.t -= dt;
    var W = this.W, H = this.H, s = this.uiScale;
    var w = W * 0.6, h = 74 * s;
    var y = H * 0.24;
    var fade = clamp(b.t / 0.5, 0, 1) * b.alpha;
    var x = b.x - w / 2;
    g.fillStyle(0x061019, 0.86 * fade);
    g.fillRoundedRect(x, y - h / 2, w, h, 12 * s);
    g.lineStyle(2.5, b.tint, 0.9 * fade);
    g.strokeRoundedRect(x, y - h / 2, w, h, 12 * s);
    g.fillStyle(b.tint, 0.5 * fade);
    g.fillRect(x + 10 * s, y - h / 2 + 6 * s, 4 * s, h - 12 * s);
    this.bannerTitle.setVisible(true).setPosition(b.x, y - 12 * s).setAlpha(fade);
    setColorIfChanged(this.bannerTitle, hex(b.tint));
    this.bannerSub.setVisible(true).setPosition(b.x, y + 16 * s).setAlpha(fade * 0.9);
  };

  // ======================================================================
  // coach strip (tutorial)
  // ======================================================================
  var COACH = [
    { title: 'THRUST', body: 'DRAG LEFT' },
    { title: 'DRIFT', body: 'AIM AGAINST THE ARROW' },
    { title: 'FIRE', body: 'HOLD RIGHT' },
    { title: 'DASH', body: 'TAP THE DIAL' },
    { title: 'ORE', body: 'FLY CLOSE TO COLLECT' },
    { title: 'UPGRADE', body: 'PICK ONE CARD' }
  ];

  PLAY.paintCoach = function (dt) {
    var g = this.coachG;
    g.clear();
    var t = this.tut;
    var want = t && !t.done && this.mode === 'play' ? 1 : 0;
    if (want && t.t > 3) want = Math.max(0.12, 1 - (t.t - 3) / 0.7);
    this.coachAlpha += (want - this.coachAlpha) *
      (I.isReduced() ? 1 : Math.min(1, dt * 6));
    if (this.coachAlpha < 0.02) { this.coachT.setVisible(false); return; }
    var step = t ? clamp(t.step, 0, COACH.length - 1) : 0;
    var c = COACH[step] || COACH[0];
    var W = this.W, s = this.uiScale;
    // A single line directly under the top HUD. It never enters the middle
    // of the field and fades to near-transparent after roughly three seconds.
    var h = 30;
    var y = this.ins.t + Math.max(84, Math.round(88 * s));
    var w = Math.min(W - 32, 620);
    var x = W / 2 - w / 2;
    g.fillStyle(0x07131e, 0.78 * this.coachAlpha);
    g.fillRoundedRect(x, y, w, h, h / 2);
    g.lineStyle(1.5, 0x5fd0f0, 0.6 * this.coachAlpha);
    g.strokeRoundedRect(x, y, w, h, h / 2);
    this.coachT.setWordWrapWidth(0, false)
      .setVisible(true).setPosition(W / 2, y + h / 2).setAlpha(this.coachAlpha);
    setTextIfChanged(this.coachT, c.title + '  ·  ' + c.body);
  };

  PLAY.paintToast = function (dt) {
    var g = this.toastG;
    g.clear();
    this.toastT.setVisible(false);
    if (this.overlayOpen || this.mode !== 'play' || (this.tut && !this.tut.done)) return;
    if (!this.toast && this.toastQueue.length) this.toast = this.toastQueue.shift();
    var item = this.toast;
    if (!item) return;
    item.t -= dt;
    if (item.t <= 0) {
      this.toast = null;
      if (this.toastQueue.length) this.toast = this.toastQueue.shift();
      return;
    }
    var s = this.uiScale;
    var W = this.W, ins = this.ins;
    var h = 28;
    var w = Math.min(W - 32, Math.max(150, Math.min(270, item.text.length * 8 + 34)));
    var x = ins.l + 16;
    var y = ins.t + Math.max(118, Math.round(122 * s));
    var fade = I.isReduced() ? 1 : clamp(item.t / 0.18, 0, 1);
    g.fillStyle(0x061019, 0.82 * fade);
    g.fillRoundedRect(x, y, w, h, 8);
    g.lineStyle(1.5, item.tint, 0.85 * fade);
    g.strokeRoundedRect(x, y, w, h, 8);
    g.fillStyle(item.tint, 0.85 * fade);
    g.fillRect(x + 7, y + 6, 3, h - 12);
    this.toastT.setVisible(true).setPosition(x + 18, y + h / 2).setAlpha(fade);
    setColorIfChanged(this.toastT, hex(item.tint));
    setTextIfChanged(this.toastT, item.text);
  };

  // ======================================================================
  // overlays: upgrade and results
  // ======================================================================
  PLAY.clearOverlay = function () {
    this.overlayOpen = false;
    this.overlayG.clear();
    this.overlayBtns.clear();
    for (var i = 0; i < this.overlayText.length; i++) this.overlayText[i].destroy();
    this.overlayText.length = 0;
    this.overlayCards = null;
    this.overlayPrev = null;
    this.overlayNext = null;
    this.overlayPage = 0;
    Tap.clear();
  };

  PLAY.openUpgrade = function () {
    var scene = this;
    this.clearOverlay();
    this.clearToast();
    this.overlayOpen = true;
    this.overlayKind = 'upgrade';
    this.overlayPage = 0;

    // three distinct offers, seeded off the run so a replayed seed offers
    // the same cards
    var pool = D.UPGRADES.slice();
    var offers = [];
    for (var n = 0; n < 3 && pool.length; n++) {
      var idx = Math.floor(this.rng() * pool.length);
      offers.push(pool.splice(idx, 1)[0]);
    }
    this.offers = offers;
    this.overlayCards = [];
    for (var i = 0; i < offers.length; i++) {
      (function (k) {
        var o = offers[k];
        var b = scene.overlayBtns.add(M.slab(scene, {
          w: 200, h: 150, text: o.name, sub: o.detail, tint: o.tint, size: 15, depth: 92,
          onTap: function () { scene.takeUpgrade(k); }
        }));
        scene.overlayCards.push(b);
      }(i));
    }
    this.overlayPrev = this.overlayBtns.add(M.slab(this, {
      w: 92, h: 36, text: 'PREV', tint: 0x8fb3c6, size: 11, depth: 92,
      onTap: function () {
        scene.overlayPage = Math.max(0, scene.overlayPage - 1);
        scene.layoutOverlay();
      }
    }));
    this.overlayNext = this.overlayBtns.add(M.slab(this, {
      w: 92, h: 36, text: 'NEXT', tint: 0x5fe0ff, size: 11, depth: 92,
      onTap: function () {
        scene.overlayPage = Math.min(scene.offers.length - 1, scene.overlayPage + 1);
        scene.layoutOverlay();
      }
    }));
    this.overlayText.push(txt(this, 0, 0, 'WAVE CLEARED', 24, '#eaf9ff', '800')
      .setOrigin(0.5).setDepth(93));
    this.overlayText.push(txt(this, 0, 0, 'Choose one upgrade. Keys 1, 2, 3.', 13, '#8fb3c6', '600')
      .setOrigin(0.5).setDepth(93));
    this.overlayText.push(txt(this, 0, 0, '', 12, '#8fb3c6', '600')
      .setOrigin(0.5).setDepth(93).setVisible(false));
    kit.audio.sfx('upgrade', { volume: 0.8 });
    this.layoutOverlay();
  };

  PLAY.takeUpgrade = function (index) {
    var o = this.offers && this.offers[index];
    if (!o) return;
    var up = D.upgradeById(o.id);
    if (up && typeof up.apply === 'function') up.apply(this.st);
    this.takenUpgrades.push(up.id);
    kit.audio.sfx('upgrade', { volume: 0.9 });
    this.clearOverlay();
    this.queueToast('UPG  ' + up.name, up.tint, 1.0);
    this.advanceWave();
  };

  PLAY.openResults = function () {
    var scene = this;
    this.clearOverlay();
    this.clearToast();
    this.overlayOpen = true;
    this.overlayKind = 'results';
    var r = this.result || { win: false, medal: 'none', time: 0, ore: 0, score: 0 };
    var s = this.sector;

    this.overlayText.push(txt(this, 0, 0, r.win ? 'SECTOR CLEAR' : 'HULL BREACH',
      30, r.win ? '#7ef0b4' : '#ff8a90', '800').setOrigin(0.5).setDepth(93));
    this.overlayText.push(txt(this, 0, 0, s.name, 15, '#bfe0ef', '700')
      .setOrigin(0.5).setDepth(93));
    this.overlayText.push(txt(this, 0, 0,
      'SCORE ' + I.pad(r.score, 6) + '    ORE ' + r.ore + '    TIME ' + I.mmss(r.time) +
      '    WAVE ' + this.wave + ' / ' + D.WAVES_PER_SECTOR,
      14, '#dff4ff', '700').setOrigin(0.5).setDepth(93));
    this.overlayText.push(txt(this, 0, 0,
      r.win ? ('MEDAL: ' + r.medal.toUpperCase()) :
        ('BEST THIS SECTOR: ' + I.pad(I.PROFILE.best[s.id] || 0, 6)),
      16, hex(D.MEDAL_TINT[r.medal] || 0xd8e6ef), '800').setOrigin(0.5).setDepth(93));
    var nextName = this.sectorIndex + 1 < D.SECTORS.length ?
      D.sectorAt(this.sectorIndex + 1).name : null;
    this.overlayText.push(txt(this, 0, 0,
      r.win && nextName && I.unlockedCount() > this.sectorIndex + 1 ?
        (nextName + ' UNLOCKED') : '',
      13, '#ffd76a', '700').setOrigin(0.5).setDepth(93));

    this.overlayBtns.add(M.slab(this, {
      w: 190, h: 54, text: 'RUN AGAIN', tint: 0x5fe0ff, depth: 92,
      onTap: function () { scene.clearOverlay(); scene.startRun(1); }
    }));
    this.overlayBtns.add(M.slab(this, {
      w: 190, h: 54, text: 'SECTORS', tint: 0x8fb3c6, depth: 92,
      onTap: function () { scene.clearOverlay(); scene.scene.start('Select'); }
    }));
    this.layoutOverlay();
  };

  PLAY.layoutOverlay = function () {
    if (!this.overlayOpen) return;
    var W = this.W, H = this.H, s = this.uiScale;
    var i, b;
    if (this.overlayKind === 'upgrade') {
      var n = this.overlayCards.length;
      var narrow = W < 700 || H < 520;
      var pager = this.overlayText[2];
      if (narrow) {
        var page = clamp(this.overlayPage || 0, 0, n - 1);
        var oneW = Math.round(clamp(W * 0.78, 190, 320));
        var oneH = Math.round(clamp(H * 0.34, 100, 168));
        for (i = 0; i < n; i++) this.overlayCards[i].hidden = i !== page;
        b = this.overlayCards[page];
        b.hidden = false; b.w = oneW; b.h = oneH;
        b.setPos(W / 2 - oneW / 2, H * 0.43 - oneH / 2);
        this.overlayPrev.hidden = page === 0;
        this.overlayNext.hidden = page === n - 1;
        this.overlayPrev.w = 92; this.overlayPrev.h = 36;
        this.overlayNext.w = 92; this.overlayNext.h = 36;
        this.overlayPrev.setPos(W / 2 - 104, H * 0.78);
        this.overlayNext.setPos(W / 2 + 12, H * 0.78);
        pager.setVisible(true).setPosition(W / 2, H * 0.68);
        setTextIfChanged(pager, 'CARD ' + (page + 1) + ' / ' + n + '  -  choose the visible card');
        this.overlayText[0].setPosition(W / 2, H * 0.13).setFontSize(Math.round(22 * s));
        this.overlayText[1].setPosition(W / 2, H * 0.21).setFontSize(Math.round(12 * s));
        return;
      }
      for (i = 0; i < n; i++) this.overlayCards[i].hidden = false;
      this.overlayPrev.hidden = true;
      this.overlayNext.hidden = true;
      pager.setVisible(false);
      var cw = Math.round(clamp(W * 0.24, 150, 240));
      var chh = Math.round(clamp(H * 0.34, 120, 190));
      var gap = Math.round(16 * s);
      var total = n * cw + (n - 1) * gap;
      var x0 = W / 2 - total / 2;
      var y = H * 0.44;
      for (i = 0; i < n; i++) {
        b = this.overlayCards[i];
        b.w = cw; b.h = chh;
        b.setPos(x0 + i * (cw + gap), y - chh / 2);
      }
      this.overlayText[0].setPosition(W / 2, H * 0.17).setFontSize(Math.round(24 * s));
      this.overlayText[1].setPosition(W / 2, H * 0.23).setFontSize(Math.round(13 * s));
    } else {
      var list = this.overlayBtns.list;
      var bw = Math.round(clamp(W * 0.2, 150, 210));
      var bh = Math.round(clamp(54 * s, 44, 66));
      var gapB = Math.round(18 * s);
      var tw = list.length * bw + (list.length - 1) * gapB;
      for (i = 0; i < list.length; i++) {
        b = list[i];
        b.w = bw; b.h = bh;
        b.setPos(W / 2 - tw / 2 + i * (bw + gapB), H * 0.74);
      }
      this.overlayText[0].setPosition(W / 2, H * 0.26).setFontSize(Math.round(30 * s));
      this.overlayText[1].setPosition(W / 2, H * 0.35).setFontSize(Math.round(15 * s));
      this.overlayText[2].setPosition(W / 2, H * 0.45).setFontSize(Math.round(14 * s));
      this.overlayText[3].setPosition(W / 2, H * 0.53).setFontSize(Math.round(16 * s));
      this.overlayText[4].setPosition(W / 2, H * 0.60).setFontSize(Math.round(13 * s));
    }
  };

  PLAY.paintOverlay = function () {
    var g = this.overlayG;
    g.clear();
    if (!this.overlayOpen) return;
    g.fillStyle(0x03080e, this.overlayKind === 'results' ? 0.82 : 0.7);
    g.fillRect(0, 0, this.W, this.H);
    this.overlayBtns.update(Tap);
    // keyboard shortcuts on the overlays
    if (this.overlayKind === 'upgrade') {
      this.edge('Digit1', 'u1'); this.edge('Digit2', 'u2'); this.edge('Digit3', 'u3');
      for (var i = 1; i <= 3; i++) if (this.edgeFired['u' + i]) { this.takeUpgrade(i - 1); return; }
    } else {
      this.edge('Enter', 'again'); this.edge('KeyR', 'again2');
      if (this.edgeFired.again || this.edgeFired.again2) {
        this.clearOverlay(); this.startRun(1); return;
      }
      this.edge('Escape', 'toSel');
      if (this.edgeFired.toSel) { this.clearOverlay(); this.scene.start('Select'); }
    }
  };

  // ======================================================================
  // paint
  // ======================================================================
  PLAY.paint = function (dt) {
    var ship = this.ship;
    this.sky.tick(dt, -ship.vx, -ship.vy);
    this.paintEntities(dt);
    this.paintShip(dt);
    this.paintBeam();
    this.paintGhosts();
    this.paintHud(dt);
    this.paintControls();
    this.paintBanner(dt);
    this.paintCoach(dt);
    this.paintToast(dt);
    this.paintOverlay();
  };

  PLAY.paintEntities = function (dt) {
    var i, e;
    for (i = 0; i < this.rocks.length; i++) {
      e = this.rocks[i];
      if (!e.alive) continue;
      e.spr.setPosition(e.x, e.y);
      e.spr.rotation = e.rot;
      // the rock textures already carry their family palette; tinting them
      // again only muddies the art, so the flash is the only tint applied
      e.spr.setTint(e.hit > 0 ? 0xfff2f2 : 0xffffff);
      e.spr.setAlpha(1);
    }
    for (i = 0; i < this.shots.length; i++) {
      e = this.shots[i];
      if (!e.alive) continue;
      e.spr.setPosition(e.x, e.y);
      e.spr.rotation = Math.atan2(e.vy, e.vx);
    }
    for (i = 0; i < this.pickups.length; i++) {
      e = this.pickups[i];
      if (!e.alive) continue;
      var bob = 1 + Math.sin(e.bob) * 0.09 + e.pull * 0.2;
      e.spr.setPosition(e.x, e.y).setScale((e.kind === 'burst' ? 0.62 : 0.5) * bob);
      e.spr.setAlpha(e.life < 2.5 ? clamp(e.life / 2.5, 0.15, 1) : 1);
      e.spr.rotation += dt * 1.4;
    }
    for (i = 0; i < this.hazards.length; i++) {
      e = this.hazards[i];
      if (!e.alive) continue;
      e.spr.setPosition(e.x, e.y);
      if (e.type === 'well') {
        e.spr.rotation = e.rot;
        e.spr.setScale(1.5 + Math.sin(e.rot * 2) * 0.05).setAlpha(0.85);
      } else if (e.type === 'mine') {
        e.spr.rotation = e.rot;
        var arm = e.state !== 'idle';
        e.spr.setTint(e.hit > 0 ? 0xffffff : (arm ? 0xffd0a0 : 0xffffff));
        e.spr.setScale(0.66 * (arm ? 1 + Math.sin(this.waveTime * 22) * 0.08 : 1));
      } else if (e.type === 'geode') {
        e.spr.rotation = e.rot;
        e.spr.setTint(0xffffff);
        for (var n = 0; n < e.nodes.length; n++) {
          var nd = e.nodes[n];
          if (!nd.alive) { nd.spr.setVisible(false); continue; }
          nd.spr.setVisible(true).setPosition(nd.x, nd.y)
            .setTint(nd.hit > 0 ? 0xffffff : 0xf0dcff)
            .setScale(0.85 + Math.sin(this.runTime * 5 + n) * 0.05);
        }
      } else {
        e.spr.rotation = e.rot;
        e.spr.setTint(e.hit > 0 ? 0xffffff : 0xffffff);
      }
    }
    // boss
    var b = this.boss;
    if (b.alive) {
      b.spr.setVisible(true).setPosition(b.x, b.y).setScale(0.98 +
        (b.telegraph > 0 ? Math.sin(this.runTime * 30) * 0.05 : 0));
      b.spr.rotation = b.spin * 0.35;
      b.spr.setTint(b.hit > 0 ? 0xffffff : (b.telegraph > 0 ? 0xffd0b0 : this.family.tint));
      for (var a = 0; a < b.arms.length; a++) {
        var armv = b.arms[a];
        if (!armv.alive) continue;
        for (var k = 0; k < armv.segs.length; k++) {
          var f = (k + 1) / (armv.segs.length + 1);
          var armStart = armv.detached ? 0 : b.r * 0.6;
          var sx = armv.x + Math.cos(armv.ang) * (armStart + armv.len * f);
          var sy = armv.y + Math.sin(armv.ang) * (armStart + armv.len * f);
          armv.segs[k].setVisible(true).setPosition(sx, sy).setRotation(armv.ang)
            .setScale(0.8 - k * 0.08).setTint(this.family.tint);
        }
        if (armv.pod.alive) {
          armv.pod.spr.setVisible(true).setPosition(armv.pod.x, armv.pod.y)
            .setTint(armv.pod.hit > 0 ? 0xffffff : (armv.attackT > 0 ? 0xff7a86 : 0xffd8a0))
            .setScale(0.95 + Math.sin(this.runTime * 6 + a) * 0.06);
        }
      }
    }
  };

  PLAY.paintShip = function (dt) {
    var ship = this.ship, s = ship.spr;
    if (!ship.alive) { s.setVisible(false); this.shipGlow.setAlpha(0); this.driftG.clear(); return; }
    var blink = ship.invuln > 0 && Math.floor(this.runTime * 16) % 2 === 0;
    s.setVisible(!blink).setPosition(ship.x, ship.y);
    s.rotation = ship.ang;
    var crit = this.st.shield <= 1;
    s.setTint(ship.hitFlash > 0.4 ? 0xff9aa2 : (crit ? 0xffc8c8 : 0xffffff));
    this.shipGlow.setPosition(ship.x, ship.y)
      .setAlpha(clamp(0.18 + ship.thrusting * 0.3 + (ship.dash > 0 ? 0.5 : 0), 0, 1))
      .setScale(1.2 + ship.thrusting * 0.35 + (ship.dash > 0 ? 0.8 : 0))
      .setTint(ship.dash > 0 ? 0xffd07a : (crit ? 0xff8a90 : 0x7fd8ff));

    // thrust trail states: idle pilot flame, cruise plume, dash flare,
    // retro nose jets
    this.exhaustT = (this.exhaustT || 0) - dt;
    if (this.exhaustT <= 0) {
      this.exhaustT = 0.02;
      var bx = ship.x - Math.cos(ship.ang) * 22;
      var by = ship.y - Math.sin(ship.ang) * 22;
      if (ship.dash > 0) {
        emit(this.fx.exhaust, bx, by, 3, 0xffd07a);
      } else if (ship.thrusting > 0.15) {
        emit(this.fx.exhaust, bx, by, ship.thrusting > 0.6 ? 2 : 1, 0x8fe8ff);
      } else if (this.runTime % 0.2 < 0.03) {
        emit(this.fx.exhaust, bx, by, 1, 0x4a86a8);
      }
      if (ship.retro > 0.25) {
        var nx = ship.x + Math.cos(ship.ang) * 16;
        var ny = ship.y + Math.sin(ship.ang) * 16;
        emit(this.fx.exhaust, nx, ny, 1, 0xffb27a);
      }
    }

    // drift readout: prograde arrow plus a brake chevron when countering
    var g = this.driftG;
    var sp = Math.hypot(ship.vx, ship.vy);
    var wantRing = ship.dash > 0 || this.st.dashCharge < this.st.dashMax;
    if (sp <= 26 && !wantRing) {
      if (this.driftDrawn) { g.clear(); this.driftDrawn = false; }
      return;
    }
    this.driftDrawn = true;
    g.clear();
    if (sp > 26) {
      var a = Math.atan2(ship.vy, ship.vx);
      var len = clamp(sp * 0.14, 18, 78);
      var tipx = ship.x + Math.cos(a) * (26 + len);
      var tipy = ship.y + Math.sin(a) * (26 + len);
      g.lineStyle(2, ship.retro > 0.25 ? 0xffb27a : 0x7fd8ff, 0.42);
      g.beginPath();
      g.moveTo(ship.x + Math.cos(a) * 24, ship.y + Math.sin(a) * 24);
      g.lineTo(tipx, tipy);
      g.strokePath();
      g.fillStyle(ship.retro > 0.25 ? 0xffb27a : 0x7fd8ff, 0.55);
      g.fillTriangle(
        tipx + Math.cos(a) * 7, tipy + Math.sin(a) * 7,
        tipx + Math.cos(a + 2.5) * 6, tipy + Math.sin(a + 2.5) * 6,
        tipx + Math.cos(a - 2.5) * 6, tipy + Math.sin(a - 2.5) * 6);
    }
    if (wantRing) {
      // dash cooldown ring around the hull
      var frac = this.st.dashCharge >= this.st.dashMax ? 1 :
        clamp(this.st.dashTimer / I.SHIP.dashRecharge, 0, 1);
      if (frac > 0.01) {
        g.lineStyle(3, 0xd2a0ff, 0.5);
        arcPath(g, ship.x, ship.y, 26, -Math.PI / 2, -Math.PI / 2 + frac * TAU,
          Math.max(4, Math.round(frac * 20)));
      }
    }
  };

  PLAY.paintBeam = function () {
    var g = this.beamG;
    g.clear();
    var w = this.currentWeapon();
    if (w.kind !== 'beam' || this.beamT <= 0 || this.vent > 0 || this.mode !== 'play') return;
    var ship = this.ship;
    var over = this.overcharge > 0;
    var x2 = ship.x + Math.cos(ship.ang) * w.range;
    var y2 = ship.y + Math.sin(ship.ang) * w.range;
    var pulse = 1 + Math.sin(this.runTime * 40) * 0.18;
    g.lineStyle(16 * pulse, w.tint, 0.16);
    g.lineBetween(ship.x, ship.y, x2, y2);
    g.lineStyle(7 * pulse, w.tint, 0.5);
    g.lineBetween(ship.x, ship.y, x2, y2);
    g.lineStyle(2.6 * pulse, over ? 0xffe8b0 : 0xffffff, 0.95);
    g.lineBetween(ship.x, ship.y, x2, y2);
  };

  // Wrap ghosts: an entity within a body-length of an edge is drawn a
  // second time on the opposite side so nothing pops in from nowhere.
  PLAY.paintGhosts = function () {
    var W = this.W, H = this.H;
    var used = 0, i, k;
    var list = this.rocks;
    for (i = 0; i < list.length && used < this.ghosts.length; i++) {
      var e = list[i];
      if (!e.alive || e.comet) continue;
      var ox = e.x < e.r ? W : (e.x > W - e.r ? -W : 0);
      var oy = e.y < e.r ? H : (e.y > H - e.r ? -H : 0);
      if (!ox && !oy) continue;
      var offsets = [];
      if (ox) offsets.push([ox, 0]);
      if (oy) offsets.push([0, oy]);
      if (ox && oy) offsets.push([ox, oy]);
      for (k = 0; k < offsets.length && used < this.ghosts.length; k++) {
        var gsp = this.ghosts[used++];
        if (gsp.texture.key !== e.spr.texture.key) gsp.setTexture(e.spr.texture.key, e.spr.frame.name);
        else if (gsp.frame.name !== e.spr.frame.name) gsp.setFrame(e.spr.frame.name);
        gsp.setVisible(true)
          .setPosition(e.x + offsets[k][0], e.y + offsets[k][1])
          .setScale(e.spr.scaleX).setTint(e.spr.tintTopLeft).setAlpha(e.spr.alpha);
        gsp.rotation = e.rot;
      }
    }
    var ship = this.ship;
    if (ship.alive && used < this.ghosts.length) {
      var sox = ship.x < ship.r ? W : (ship.x > W - ship.r ? -W : 0);
      var soy = ship.y < ship.r ? H : (ship.y > H - ship.r ? -H : 0);
      if (sox || soy) {
        var gs = this.ghosts[used++];
        if (gs.frame.name !== 'ship') I.setFrame(gs, this, 'ship');
        gs.setVisible(true)
          .setPosition(ship.x + sox, ship.y + soy)
          .setScale(0.62).setTint(0xffffff).setAlpha(ship.spr.visible ? 1 : 0);
        gs.rotation = ship.ang;
      }
    }
    for (i = used; i < this.ghosts.length; i++) this.ghosts[i].setVisible(false);
  };

  PLAY.paintHud = function (dt) {
    var g = this.hudG, t = this.hudT;
    var W = this.W, H = this.H, s = this.uiScale, ins = this.ins;

    setTextIfChanged(t.sector, 'S' + (this.sectorIndex + 1));
    setTextIfChanged(t.wave, this.wave + ' / ' + D.WAVES_PER_SECTOR);
    setTextIfChanged(t.timer, '◷ ' + I.mmss(this.runTime));
    setTextIfChanged(t.score, '✦ ' + I.pad(this.score, 6));
    setTextIfChanged(t.ore, '◆ ' + this.ore);

    // The pip row, shield row and boss bar only move when a value moves.
    var st = this.st;
    var bossFrac = this.boss.alive ? Math.round(clamp(this.boss.hp / this.boss.hpMax, 0, 1) * 120) : -1;
    var sig = this.wave + '|' + st.shield + '|' + st.shieldMax + '|' + bossFrac + '|' +
      (this.boss.alive ? this.boss.podsLeft : -1) + '|' + Math.round(W) + 'x' + Math.round(H) +
      '|' + (st.shield === 1 ? Math.floor(this.runTime * 8) : 0);
    if (sig !== this.hudSig) {
      this.hudSig = sig;
      this.paintHudPlates();
    }
    this.paintVignette();
  };

  PLAY.paintHudPlates = function () {
    var g = this.hudG;
    var W = this.W, s = this.uiScale, ins = this.ins;
    g.clear();
    // wave pips
    var i;
    var edge = Math.max(16, Math.round(18 * s));
    var px = ins.l + edge, py = this.hudY.pips;
    for (i = 1; i <= D.WAVES_PER_SECTOR; i++) {
      var boss = i === D.WAVES_PER_SECTOR;
      var setp = i === D.SETPIECE_WAVE;
      var rr = (boss ? 6 : setp ? 5 : 3.6) * s;
      var cx = px + (i - 1) * 15 * s;
      if (i < this.wave) { g.fillStyle(0x5fd0f0, 0.85); g.fillCircle(cx, py, rr); }
      else if (i === this.wave) {
        g.fillStyle(boss ? 0xff9060 : (setp ? 0xffd76a : 0xffffff), 1);
        g.fillCircle(cx, py, rr + 1.5 * s);
      } else {
        g.lineStyle(1.5, boss ? 0xff9060 : (setp ? 0xffd76a : 0x51707f), 0.8);
        g.strokeCircle(cx, py, rr);
      }
    }

    // shield cells
    var sx = ins.l + edge, sy = this.hudY.shields;
    var st = this.st;
    for (i = 0; i < st.shieldMax; i++) {
      var on = i < st.shield;
      var cxx = sx + i * 17 * s;
      var crit = st.shield === 1 && i === 0;
      var pulse = crit ? 0.6 + Math.abs(Math.sin(this.runTime * 6)) * 0.4 : 1;
      g.lineStyle(2, on ? (st.shield === 1 ? 0xff6a72 : 0x7fd8ff) : 0x33505f, on ? pulse : 0.6);
      g.beginPath();
      g.moveTo(cxx, sy - 7 * s);
      g.lineTo(cxx + 6 * s, sy - 2 * s);
      g.lineTo(cxx + 4 * s, sy + 7 * s);
      g.lineTo(cxx - 4 * s, sy + 7 * s);
      g.lineTo(cxx - 6 * s, sy - 2 * s);
      g.closePath();
      if (on) { g.fillStyle(st.shield === 1 ? 0xff6a72 : 0x7fd8ff, 0.28 * pulse); g.fillPath(); }
      g.strokePath();
    }

    // boss health bar, centred under the top band
    if (this.boss.alive) {
      var bw = W * 0.4, bh = 8 * s;
      var bx = W / 2 - bw / 2, by = ins.t + 38 * s;
      g.fillStyle(0x0a1219, 0.8);
      g.fillRoundedRect(bx - 2, by - 2, bw + 4, bh + 4, 4);
      g.fillStyle(0x3b1f22, 1);
      g.fillRect(bx, by, bw, bh);
      var frac = clamp(this.boss.hp / this.boss.hpMax, 0, 1);
      g.fillStyle(this.boss.podsLeft > 0 ? 0x6d7f8c : 0xff7a5a, 1);
      g.fillRect(bx, by, bw * frac, bh);
      g.lineStyle(1.5, 0xffb08a, 0.8);
      g.strokeRect(bx, by, bw, bh);
    }
  };

  // Compact objective state and the damage vignette are the only per-frame
  // HUD work. Long descriptions live in the menus and results screen.
  PLAY.paintVignette = function () {
    var t = this.hudT, W = this.W, H = this.H, st = this.st;
    var obj = '';
    if (this.spec && this.spec.kind === 'boss' && this.boss.alive) {
      obj = 'P' + this.boss.phase + (this.boss.podsLeft > 0 ? '  ·  ' + this.boss.podsLeft : '');
    } else if (this.spec && this.spec.kind === 'setpiece' && this.setpiece) {
      if (this.setpiece.id === 'grinder') obj = '◷ ' + Math.ceil(this.survive) + 's';
      else if (this.setpiece.id === 'convoy') obj = '⬢ ' + this.aliveHazards('hulk');
      else if (this.setpiece.id === 'bloom') {
        var nodes = 0;
        for (var i = 0; i < this.hazards.length; i++) {
          var h = this.hazards[i];
          if (!h.alive || h.type !== 'geode') continue;
          for (var n = 0; n < h.nodes.length; n++) if (h.nodes[n].alive) nodes++;
        }
        obj = '◇ ' + nodes;
      }
    }
    setTextIfChanged(t.objective, obj);
    t.objective.setVisible(!!obj && this.mode === 'play' && !this.overlayOpen);

    // critical vignette
    var v = this.vignette;
    v.clear();
    if (this.overlayOpen) return;
    var critA = 0;
    if (st.shield <= 1 && this.mode === 'play') {
      critA = 0.10 + Math.abs(Math.sin(this.runTime * 4)) * 0.11;
    }
    if (this.ship.hitFlash > 0) critA = Math.max(critA, this.ship.hitFlash * 0.26);
    if (critA > 0.01) {
      // three nested bands fake a soft gradient; a single flat rectangle read
      // as a hard red frame around the play area
      var band = Math.min(W, H) * 0.13;
      for (var k = 0; k < 3; k++) {
        var f = (3 - k) / 3;
        var t2 = band * (k + 1) / 3;
        v.fillStyle(0xff2a3a, critA * f * 0.5);
        v.fillRect(0, 0, W, t2);
        v.fillRect(0, H - t2, W, t2);
        v.fillRect(0, 0, t2 * 0.8, H);
        v.fillRect(W - t2 * 0.8, 0, t2 * 0.8, H);
      }
    }
  };

  PLAY.paintControls = function () {
    var g = this.ctlG, plate = this.ctlPlateG;
    g.clear();
    if (this.mode !== 'play' || this.overlayOpen) {
      plate.clear();
      this.ctlSig = '';
      for (var q = 0; q < this.chipT.length; q++) this.chipT[q].setVisible(false);
      return;
    }
    var s = this.uiScale;
    var c = this.control;
    var cap = this.heatCap();
    var heatFrac = clamp(this.heat / cap, 0, 1);
    var over = this.overcharge > 0;
    var st = this.st;

    this.layoutChips();
    // Static plates: only rebuilt when a discrete value changes.
    var sig = this.weapon + '|' + this.weapons.length + '|' + (c.firing ? 1 : 0) + '|' +
      st.dashCharge + '|' + st.dashMax + '|' + (over ? 1 : 0) + '|' + (this.vent > 0 ? 1 : 0) +
      '|' + Math.round(this.W) + 'x' + Math.round(this.H);
    if (sig !== this.ctlSig) {
      this.ctlSig = sig;
      this.paintControlPlates(over);
    }

    // Per-frame: the floating stick and the two live arcs.
    if (c.active) {
      g.lineStyle(2, 0x5fd0f0, 0.34);
      g.strokeCircle(c.ox, c.oy, 82);
      g.fillStyle(0x0d2330, 0.34);
      g.fillCircle(c.ox, c.oy, 82);
      g.fillStyle(0x7fd8ff, 0.5);
      g.fillCircle(c.ox + c.x * 66, c.oy + c.y * 66, 26);
      g.lineStyle(2, 0xdff4ff, 0.7);
      g.strokeCircle(c.ox + c.x * 66, c.oy + c.y * 66, 26);
    }
    var f = this.hudBtn.fire;
    var arcCol = this.vent > 0 ? 0xff5a4a : (heatFrac > 0.8 ? 0xffb04a : (over ? 0xffd07a : 0x7fd8ff));
    var heatSweep = (this.vent > 0 ? (this.vent / I.VENT_LOCK) : heatFrac) * Math.PI * 1.5;
    if (heatSweep > 0.01) {
      g.lineStyle(6 * s, arcCol, 1);
      arcPath(g, f.x, f.y, f.r - 5 * s, -Math.PI * 0.75, -Math.PI * 0.75 + heatSweep,
        Math.max(4, Math.round(heatSweep * 7)));
    }

    var dbtn = this.hudBtn.dash;
    if (st.dashCharge < st.dashMax) {
      var rechargeFrac = clamp(st.dashTimer / I.SHIP.dashRecharge, 0, 1);
      if (rechargeFrac > 0.01) {
        g.lineStyle(4 * s, 0xe8c8ff, 0.95);
        arcPath(g, dbtn.x, dbtn.y, dbtn.r - 4 * s, -Math.PI / 2,
          -Math.PI / 2 + rechargeFrac * TAU, Math.max(4, Math.round(rechargeFrac * 24)));
      }
    }

  };

  PLAY.paintControlPlates = function (over) {
    var g = this.ctlPlateG;
    var s = this.uiScale, st = this.st, c = this.control;
    var i;
    g.clear();

    // fire button
    var f = this.hudBtn.fire;
    g.fillStyle(0x1a0f14, 0.42);
    g.fillCircle(f.x, f.y, f.r);
    g.lineStyle(2, over ? 0xffd07a : 0xff8a90, 0.7);
    g.strokeCircle(f.x, f.y, f.r);
    g.fillStyle(c.firing ? 0xff6a72 : 0xd2545e, c.firing ? 0.55 : 0.34);
    g.fillCircle(f.x, f.y, f.r * 0.72);
    g.lineStyle(6 * s, 0x22323c, 0.9);
    arcPath(g, f.x, f.y, f.r - 5 * s, -Math.PI * 0.75, Math.PI * 0.75, 24);

    // dash button and its charge pips
    var dbtn = this.hudBtn.dash;
    g.fillStyle(0x150e22, 0.42);
    g.fillCircle(dbtn.x, dbtn.y, dbtn.r);
    g.lineStyle(2, st.dashCharge > 0 ? 0xd2a0ff : 0x4a4560, 0.8);
    g.strokeCircle(dbtn.x, dbtn.y, dbtn.r);
    if (st.dashCharge > 0) {
      g.fillStyle(0xd2a0ff, 0.26);
      g.fillCircle(dbtn.x, dbtn.y, dbtn.r * 0.7);
    }
    if (st.dashCharge >= st.dashMax) {
      g.lineStyle(4 * s, 0xe8c8ff, 0.95);
      g.strokeCircle(dbtn.x, dbtn.y, dbtn.r - 4 * s);
    }
    for (i = 0; i < st.dashMax; i++) {
      var a = -Math.PI / 2 + (i - (st.dashMax - 1) / 2) * 0.34;
      var pxx = dbtn.x + Math.cos(a) * (dbtn.r + 13 * s);
      var pyy = dbtn.y + Math.sin(a) * (dbtn.r + 13 * s);
      g.fillStyle(i < st.dashCharge ? 0xd2a0ff : 0x3b3550, 1);
      g.fillCircle(pxx, pyy, 3.2 * s);
    }

    // weapon chips
    for (i = 0; i < this.chipT.length; i++) {
      var chip = this.hudBtn.chips[i];
      var id = this.weapons[i];
      if (!id || this.weapons.length < 2 || (this.tut && !this.tut.done)) {
        this.chipT[i].setVisible(false);
        continue;
      }
      var def = D.weapon(id);
      var active = id === this.weapon;
      g.fillStyle(0x0b1a24, active ? 0.9 : 0.55);
      g.fillRoundedRect(chip.x, chip.y, chip.w, chip.h, chip.h / 2);
      g.lineStyle(active ? 2 : 1.2, def.tint, active ? 1 : 0.45);
      g.strokeRoundedRect(chip.x, chip.y, chip.w, chip.h, chip.h / 2);
      this.chipT[i].setVisible(true);
      setColorIfChanged(this.chipT[i], active ? hex(def.tint) : '#7f9aa8');
      setTextIfChanged(this.chipT[i], weaponMark(id));
    }

    // pause pip
    var pb = this.hudBtn.pause;
    g.fillStyle(0x0d1d2a, 0.6);
    g.fillCircle(pb.x, pb.y, pb.r);
    g.lineStyle(1.6, 0x5fd0f0, 0.7);
    g.strokeCircle(pb.x, pb.y, pb.r);
    g.fillStyle(0xcfe9f6, 0.9);
    g.fillRect(pb.x - 5 * s, pb.y - 6 * s, 3.4 * s, 12 * s);
    g.fillRect(pb.x + 1.6 * s, pb.y - 6 * s, 3.4 * s, 12 * s);
  };

  // ======================================================================
  // boot
  // ======================================================================
  // Phaser only wires preload/create/update off a plain config object, so
  // each scene literal is promoted to a real Scene subclass carrying its
  // whole method set on the prototype.
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

  Game.phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: '#081420',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: window.innerWidth,
      height: window.innerHeight
    },
    render: {
      antialias: true, antialiasGL: false, powerPreference: 'high-performance',
      roundPixels: false, batchSize: 4096
    },
    fps: { target: 60, min: 30 },
    scene: [toScene(I.BootScene), toScene(M.TitleScene), toScene(M.SelectScene), toScene(PLAY)]
  });

  kit.registerPWA();
  window.__HB_READY = true;
  window.__hb.scene = function () { return Game.play; };
  window.__hb.debug = function () {
    var s = Game.play;
    if (!s) return 'noscene';
    return s.mode + ' s' + (s.sectorIndex + 1) + ' w' + s.wave +
      ' rocks' + s.aliveRocks() + ' haz' + s.aliveHazards(null) +
      ' sh' + s.st.shield + '/' + s.st.shieldMax +
      ' heat' + Math.round(s.heat) + ' dash' + s.st.dashCharge +
      ' ore' + s.ore + ' score' + Math.round(s.score);
  };
}());
