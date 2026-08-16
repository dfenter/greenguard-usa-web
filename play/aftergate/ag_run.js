/* Aftergate - RUN scene: steer the marching squad down an authored road.
 *
 * Rendering contract: NO static Graphics survives a frame. The road is a
 * baked TileSprite, every gate / hazard / soldier is a pooled Image taken
 * from a free list each frame. Sim entities never carry view references;
 * views are assigned from the pool by the renderer and released after.
 */
'use strict';
var AG = window.AG || {};
window.AG = AG;

(function () {
  var DW = AG.DW, DH = AG.DH;
  var ROAD_L = 46, ROAD_R = 494;
  var MID = (ROAD_L + ROAD_R) / 2;
  var SQUAD_Y = 720;
  var BASE_SPEED = 262;
  var MAX_VIEWS = { gate: 5, mob: 4, saw: 6, barricade: 4, recruit: 4, portal: 4 };
  var MAX_SOLDIERS = 36;

  function RunScene() {
    Phaser.Scene.call(this, { key: 'Run' });
  }
  RunScene.prototype = Object.create(Phaser.Scene.prototype);
  RunScene.prototype.constructor = RunScene;

  /* ---------------------------------------------------------- init */
  RunScene.prototype.init = function (data) {
    var s = AG.session;
    this.data_ = data || {};
    this.siteDef = AG.site(s.siteId);
    this.road = (s.mode === 'rush') ? AG.rushRoad(s.roadId) : null;
    this.len = this.road ? this.road.len : this.siteDef.len;
    this.squad = s.squad | 0;
    this.prog = 0;
    this.sx = MID; this.rx = MID; this.vxKey = 0;
    this.inv = 0; this.hurtT = 0; this.passT = 0;
    this.evadeT = 0; this.viewTime = 0;
    this.phase = 'intro';
    this.introT = AG.ui.reduced ? 0.9 : 1.5;
    this.marchT = 0;
    this.objs = [];
    this.wiped = false;
    this.gatesTaken = 0; this.bestGate = 0;
    this.finalGate = null;
    this.portalGate = null; this.portalSpawnI = 0; this.portalSpawnLeft = 0; this.portalSpawnT = 0;
    this.portalRound = 0;
    this.landmarkBeat = false;
    this.tutorialActive = !AG.saveData.tutorialSeen && s.mode === 'campaign';
    this.stepper = new AG.ui.Stepper(4);
  };

  /* -------------------------------------------------------- content */
  RunScene.prototype.buildRoad = function () {
    var s = AG.session, i;
    this.objs.length = 0;
    if (this.road) {
      // hand-authored Gate Rush road
      for (i = 0; i < this.road.nodes.length; i++) {
        var n = this.road.nodes[i];
        if (n.k === 'gate') this.objs.push({ k: 'gate', y: n.y, L: n.L, R: n.R, hit: false, state: 'ready' });
        else if (n.k === 'mob') this.objs.push({ k: 'mob', y: n.y, side: n.side, size: n.size, dead: false });
        else if (n.k === 'saw') this.objs.push({ k: 'saw', y: n.y, ph: (i * 1.7) % 6.28, spd: n.spd, hit: false });
        else if (n.k === 'barricade') this.objs.push({ k: 'barricade', y: n.y, side: n.side, hit: false });
        else if (n.k === 'recruit') this.objs.push({ k: 'recruit', y: n.y, side: n.side, v: n.v, hit: false });
      }
      for (i = this.objs.length - 1; i >= 0; i--) {
        if (this.objs[i].k === 'gate') { this.objs[i].final = true; this.finalGate = this.objs[i]; break; }
      }
      return;
    }
    // Campaign / Endless: procedural, but paced by the site's authored
    // gate density and hazard mix, on a stable per-site seed.
    var site = this.siteDef;
    var rand = AG.rng((site.num * 40503) + (s.runSeed | 0) * 7919 + 17);
    var y = 560, guard = 0;
    var mix = site.mix, keys = ['gate', 'mob', 'saw', 'barricade', 'recruit'];
    var lastGateAt = 0;
    while (y < this.len - 340 && guard++ < 90) {
      var t = y / this.len;
      var pickK = 'gate', r = rand(), acc = 0, total = 0, j;
      for (j = 0; j < keys.length; j++) total += (mix[keys[j]] || 0);
      r *= total || 1;
      for (j = 0; j < keys.length; j++) { acc += (mix[keys[j]] || 0); if (r < acc) { pickK = keys[j]; break; } }
      // density guard: never let the player go a long stretch with no gate
      if (y - lastGateAt > 900) pickK = 'gate';
      if (pickK === 'gate') { this.objs.push(this.makeGate(y, t, rand, site)); lastGateAt = y; }
      else if (pickK === 'mob') this.objs.push({ k: 'mob', y: y, side: ['L', 'R', 'F'][Math.floor(rand() * 3)], size: -1, dead: false, scale: 0.34 + t * 0.22 });
      else if (pickK === 'saw') this.objs.push({ k: 'saw', y: y, ph: rand() * 6.28, spd: 1.1 + t * 1.1, hit: false });
      else if (pickK === 'barricade') this.objs.push({ k: 'barricade', y: y, side: rand() < 0.5 ? 'L' : 'R', hit: false });
      else this.objs.push({ k: 'recruit', y: y, side: rand() < 0.5 ? 'L' : 'R', v: Math.round(10 + 26 * t), hit: false });
      var gap = site.gateGap[0] + rand() * (site.gateGap[1] - site.gateGap[0]);
      y += gap;
    }
    // A guaranteed generous gate before every wall. The owner always wants
    // the last beat of a road to pay out.
    this.objs.push({
      k: 'gate', y: this.len - 280, hit: false, state: 'ready', final: true,
      L: { op: 'mul', v: 2 }, R: { op: 'add', v: Math.round(24 + 30 * site.swing) }
    });
    if (this.objs.length > 60) {
      var protectedFinal = this.objs[this.objs.length - 1];
      this.objs.length = 59;
      this.objs.push(protectedFinal);
    }
    for (i = this.objs.length - 1; i >= 0; i--) {
      if (this.objs[i].k === 'gate' && this.objs[i].final) { this.finalGate = this.objs[i]; break; }
    }
  };

  RunScene.prototype.makeGate = function (y, t, rand, site) {
    var sw = site.swing;
    var goods = [
      { op: 'mul', v: 2 },
      { op: 'add', v: Math.round((10 + 26 * t) * sw) },
      { op: 'add', v: Math.round((14 + 34 * t) * sw) },
      { op: 'mul', v: 2 }
    ];
    if (t > 0.55) goods.push({ op: 'mul', v: 3 });
    var bads = [
      { op: 'div', v: 2 },
      { op: 'sub', v: Math.round((8 + 20 * t) * sw) },
      { op: 'div', v: 2 },
      { op: 'sub', v: Math.round((12 + 26 * t) * sw) }
    ];
    var a, b;
    if (rand() < 0.30) { // generous: sometimes both halves pay
      a = goods[Math.floor(rand() * goods.length)];
      b = goods[Math.floor(rand() * goods.length)];
      if (a === b) b = { op: 'add', v: Math.round((8 + 14 * t) * sw) };
    } else {
      a = goods[Math.floor(rand() * goods.length)];
      b = bads[Math.floor(rand() * bads.length)];
    }
    if (rand() < 0.5) { var tmp = a; a = b; b = tmp; }
    return { k: 'gate', y: y, L: a, R: b, hit: false };
  };

  /* -------------------------------------------------------- create */
  RunScene.prototype.create = function () {
    this.cameras.main.setZoom(AG.RETINA_FACTOR);
    var self = this, i, site = this.siteDef;
    var kit = AG.kit;
    this.cam = this.cameras.main;
    this.cam.setBackgroundColor(site.sky);
    AG.input.clear();
    this.buildRoad();

    /* --- road --- */
    this.roadTile = this.add.tileSprite(DW / 2, DH / 2, DW, DH, 'road_' + site.id).setDepth(0);
    this.fogTop = this.add.image(DW / 2, 0, 'fog_' + site.id)
      .setDisplaySize(DW, 150).setOrigin(0.5, 0).setDepth(25).setScrollFactor(0);

    /* --- landmark --- */
    this.landmark = this.add.image(DW / 2, -600, site.landmark).setDepth(5).setAlpha(0.9);
    this.landmarkAt = (this.road ? 0.5 : site.landmarkAt) * this.len;

    /* --- finish --- */
    this.finish = this.add.image(DW / 2, -400, 'finish_band').setDepth(10);
    this.finishWall = this.add.image(DW / 2, -400, 'wall_' + site.id).setDepth(9).setOrigin(0.5, 1);

    /* --- pools --- */
    this.views = { gate: [], mob: [], saw: [], barricade: [], recruit: [] };
    for (i = 0; i < MAX_VIEWS.gate; i++) this.views.gate.push(this.makeGateView());
    for (i = 0; i < MAX_VIEWS.mob; i++) this.views.mob.push(this.makeMobView());
    for (i = 0; i < MAX_VIEWS.saw; i++) this.views.saw.push(this.makeSawView());
    for (i = 0; i < MAX_VIEWS.barricade; i++) this.views.barricade.push(this.makeBarricadeView());
    for (i = 0; i < MAX_VIEWS.recruit; i++) this.views.recruit.push(this.makeRecruitView());
    this.views.portal = [];
    for (i = 0; i < MAX_VIEWS.portal; i++) this.views.portal.push(this.makePortalView());

    this.soldiers = [];
    for (i = 0; i < MAX_SOLDIERS; i++) {
      var sp = this.add.image(0, 0, 'sol_run0').setDepth(30).setVisible(false);
      this.soldiers.push(sp);
    }
    this.densitySilhouettes = [];
    for (i = 0; i < 3; i++) {
      this.densitySilhouettes.push(this.add.image(0, 0, 'sol_run0').setDepth(28).setVisible(false).setAlpha(0.22));
    }
    this.leadMark = this.add.image(0, 0, 'threat_chev').setDepth(31).setAlpha(0.0)
      .setTint(0xffd479).setFlipY(true).setScale(0.7);

    /* --- particles (5 systems) --- */
    var pcfg = { lifespan: 520, speed: { min: 60, max: 260 }, scale: { start: 1, end: 0 }, quantity: 0, emitting: false, blendMode: 'ADD' };
    this.pGate = this.add.particles(0, 0, 'p_spark', pcfg).setDepth(41);
    this.pImpact = this.add.particles(0, 0, 'p_chip', { lifespan: 620, speed: { min: 40, max: 240 }, gravityY: 520, scale: { start: 1.1, end: 0.2 }, rotate: { min: 0, max: 360 }, emitting: false }).setDepth(41);
    this.pDust = this.add.particles(0, 0, 'p_dot', { lifespan: 620, speedY: { min: 40, max: 130 }, speedX: { min: -30, max: 30 }, scale: { start: 0.7, end: 0 }, alpha: { start: 0.35, end: 0 }, frequency: 70, quantity: 1, tint: 0xc8d4e0, emitting: false }).setDepth(29);
    this.pSmoke = this.add.particles(0, 0, 'p_smoke', { lifespan: 900, speed: { min: 10, max: 70 }, scale: { start: 0.7, end: 2.0 }, alpha: { start: 0.4, end: 0 }, emitting: false }).setDepth(40);
    this.pRing = this.add.particles(0, 0, 'p_ring', { lifespan: 420, speed: 0, scale: { start: 0.2, end: 1.5 }, alpha: { start: 0.9, end: 0 }, quantity: 0, emitting: false, blendMode: 'ADD' }).setDepth(42);

    /* --- HUD (UI_LAW: one compact top cluster, icons over words) --- */
    var top = AG.ui.safe.top;
    this.hud = this.add.container(0, 0).setDepth(800).setScrollFactor(0);
    this.hudIcon = this.add.image(24, top + 34, 'ico_squad').setOrigin(0, 0.5).setScale(0.95);
    this.hudCount = AG.ui.strong(this, 60, top + 34, '0', 34, '#8fd0ff', 0);
    this.hud.add(this.hudIcon); this.hud.add(this.hudCount);
    this.progMeter = new AG.ui.Meter(this, DW - 176, top + 34, 152, 14, 0x223047, site.accent);
    this.progMeter.setDepth(800).setScrollFactor(0);
    this.flagIcon = this.add.image(DW - 20, top + 34, 'ico_wall').setOrigin(1, 0.5).setScale(0.7).setDepth(801).setScrollFactor(0);
    this.hudDelta = AG.ui.strong(this, 60, top + 62, '', 18, '#7ee0a8', 0);
    this.hudDelta.setDepth(801).setScrollFactor(0).setAlpha(0);
    this.hudDeltaT = 0;
    this.squadMeter = new AG.ui.Meter(this, DW - 176, top + 62, 152, 10, 0x223047, site.accent);
    this.squadMeter.setDepth(800).setScrollFactor(0);
    this.squadMeterMax = Math.max(1, this.squad);

    this.chips = new AG.ui.Chips(this, DW - 16, top + 78, 1);
    this.coach = new AG.ui.Coach(this); this.coach.place(top + 78);
    this.banner = new AG.ui.Banner(this);
    this.pops = new AG.ui.Popups(this, 14);

    this.vign = this.add.image(DW / 2, DH / 2, 'vign').setDisplaySize(DW, DH).setDepth(860).setAlpha(0).setScrollFactor(0);

    /* --- intro boundary beat --- */
    var s = AG.session;
    var title = this.road ? this.road.name : site.name;
    var sub = this.road ? ('Best ' + (AG.saveData.rush[this.road.id] ? AG.saveData.rush[this.road.id].best : 0)) : site.landmarkName;
    this.banner.show({ boundary: true, title: title.toUpperCase(), sub: sub, color: site.accentCss, hold: this.introT });
    if (!AG.saveData.tutorialSeen || s.mode === 'rush') {
      this.coach.queue(this.road ? this.road.hint : 'Drag anywhere to steer. Move wide to dodge. Take the bigger gate.', 3.2);
    }
    kit.audio.music(site.music || 'mus_road', 900);

    this.events.on('shutdown', function () {
      self.pDust.stop();
      AG.input.clear();
    });
    this.syncHook();
  };

  /* ----------------------------------------------------- view makers */
  RunScene.prototype.makeGateView = function () {
    var c = this.add.container(0, 0).setDepth(20).setVisible(false);
    var v = { c: c };
    v.slabL = this.add.image(158 - DW / 2, -56, 'gate_slab').setDisplaySize(214, 112);
    v.slabR = this.add.image(382 - DW / 2, -56, 'gate_slab').setDisplaySize(214, 112);
    v.lipL = this.add.image(158 - DW / 2, -6, 'gate_lip').setDisplaySize(214, 14);
    v.lipR = this.add.image(382 - DW / 2, -6, 'gate_lip').setDisplaySize(214, 14);
    v.postA = this.add.image(ROAD_L + 2 - DW / 2, 4, 'gate_post').setOrigin(0.5, 1);
    v.postB = this.add.image(MID - DW / 2, 4, 'gate_post').setOrigin(0.5, 1);
    v.postC = this.add.image(ROAD_R - 2 - DW / 2, 4, 'gate_post').setOrigin(0.5, 1);
    v.labL = AG.ui.strong(this, 158 - DW / 2, -74, '', 42, '#a9f5cd');
    v.labR = AG.ui.strong(this, 382 - DW / 2, -74, '', 42, '#a9f5cd');
    v.preL = AG.ui.strong(this, 158 - DW / 2, -26, '', 22, '#e8edf5');
    v.preR = AG.ui.strong(this, 382 - DW / 2, -26, '', 22, '#e8edf5');
    c.add([v.slabL, v.slabR, v.lipL, v.lipR, v.postA, v.postB, v.postC, v.labL, v.labR, v.preL, v.preR]);
    c.setPosition(DW / 2, 0);
    return v;
  };
  RunScene.prototype.makeMobView = function () {
    var c = this.add.container(DW / 2, 0).setDepth(20).setVisible(false);
    var v = { c: c, foes: [] };
    v.slab = this.add.image(0, -42, 'gate_slab').setDisplaySize(440, 84).setTint(0xb03a44).setAlpha(0.22);
    c.add(v.slab);
    for (var i = 0; i < 8; i++) {
      var f = this.add.image(0, -30, 'mob_road').setVisible(false);
      v.foes.push(f); c.add(f);
    }
    v.count = AG.ui.strong(this, 0, -74, '', 32, '#ffb3ba');
    c.add(v.count);
    return v;
  };
  RunScene.prototype.makeSawView = function () {
    var c = this.add.container(DW / 2, 0).setDepth(21).setVisible(false);
    var v = { c: c };
    v.a = this.add.image(-100, -34, 'sawblade');
    v.b = this.add.image(100, -34, 'sawblade');
    c.add([v.a, v.b]);
    return v;
  };
  RunScene.prototype.makeBarricadeView = function () {
    var c = this.add.container(DW / 2, 0).setDepth(20).setVisible(false);
    var v = { c: c };
    v.img = this.add.image(0, -20, 'barricade');
    c.add(v.img);
    return v;
  };
  RunScene.prototype.makeRecruitView = function () {
    var c = this.add.container(DW / 2, 0).setDepth(20).setVisible(false);
    var v = { c: c };
    v.img = this.add.image(0, -30, 'recruit_flag');
    v.lab = AG.ui.strong(this, 0, -74, '', 24, '#a9f5cd');
    c.add([v.img, v.lab]);
    return v;
  };
  RunScene.prototype.makePortalView = function () {
    var c = this.add.container(DW / 2, 0).setDepth(22).setVisible(false);
    var v = { c: c };
    v.arc = this.add.image(0, -54, 'portal_arc').setAlpha(0.8);
    v.core = this.add.image(0, -42, 'portal_core').setScale(0.78);
    v.lab = AG.ui.strong(this, 0, -88, 'PORTAL', 16, '#ffd479');
    c.add([v.arc, v.core, v.lab]);
    return v;
  };

  /* ------------------------------------------------------------ sim */
  RunScene.prototype.readSteer = function () {
    var i, moved = 0;
    for (i = 0; i < AG.input.actives.length; i++) {
      var p = AG.input.actives[i];
      if (p.zone && p.zone !== 'steer') continue;
      AG.input.claim(p, 'steer');
      moved += p.dx;
    }
    if (Math.abs(moved) > 0.7 && this.tutorialActive && AG.markTutorial) {
      AG.markTutorial('steer');
      if (!AG.saveData.tutorial.evade) this.coach.say('Good. Move wide to dodge hazards and portal rushes.', 2.8);
    }
    return moved;
  };

  RunScene.prototype.step = function () {
    var dt = AG.STEP, i;
    this.inv = Math.max(0, this.inv - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.passT = Math.max(0, this.passT - dt);
    this.evadeT = Math.max(0, this.evadeT - dt);

    var kv = 0;
    if (AG.input.down('ArrowLeft') || AG.input.down('KeyA')) kv -= 1;
    if (AG.input.down('ArrowRight') || AG.input.down('KeyD')) kv += 1;
    this.sx += kv * 430 * dt;
    this.sx = AG.clamp(this.sx, ROAD_L + 24, ROAD_R - 24);

    var prev = this.prog;
    var portalSlow = this.portalGate && this.portalGate.state === 'open' ? 0.58 : 1;
    this.prog += BASE_SPEED * dt * portalSlow;

    if (!this.landmarkBeat && prev < this.landmarkAt && this.prog >= this.landmarkAt) {
      this.landmarkBeat = true;
      this.pRing.setParticleTint(this.siteDef.accent);
      this.pRing.explode(1, this.sx, SQUAD_Y - 36);
      this.chips.push(this.siteDef.landmarkName + ' reached', this.siteDef.accentCss, 'ico_wall');
    }

    // A gate opens a short portal encounter. Portal units are hazards with
    // their own trigger window, so the final gate cannot be skipped by speed.
    if (this.portalGate && this.portalGate.state === 'open') {
      this.portalSpawnT -= dt;
      if (this.portalSpawnLeft > 0 && this.portalSpawnT <= 0) {
        var pidx = this.portalSpawnI++;
        this.portalSpawnLeft--;
        this.portalSpawnT = 0.18;
        this.objs.push({
          k: 'portal', y: this.prog + 118 + pidx * 76,
          side: pidx % 3 === 0 ? 'F' : (pidx % 2 ? 'R' : 'L'),
          size: Math.max(5, Math.round(this.squad * (this.portalGate.final ? 0.18 : 0.12))),
          dead: false, portalFor: this.portalGate
        });
      }
      if (this.portalSpawnLeft === 0) {
        var portalClear = true;
        for (i = 0; i < this.objs.length; i++) {
          if (this.objs[i].k === 'portal' && this.objs[i].portalFor === this.portalGate && !this.objs[i].dead) {
            portalClear = false; break;
          }
        }
        if (portalClear && this.prog > this.portalGate.y + 110) {
          this.portalGate.state = 'spent';
          this.portalGate.hit = true;
          this.portalGate = null;
          this.chips.push('PORTAL CLEARED', '#a9f5cd', 'ico_squad');
        }
      }
    }

    this.marchT -= dt;
    if (this.marchT <= 0) { this.marchT = 0.30; AG.kit.audio.sfx('march', { volume: 0.32, rate: 0.9 + Math.random() * 0.2 }); }

    for (i = 0; i < this.objs.length; i++) {
      var o = this.objs[i];
      if (o.k === 'gate') {
        if (o.state === 'ready' && prev < o.y && this.prog >= o.y) {
          o.state = 'open';
          this.applyGate(this.sx < MID ? o.L : o.R);
          this.beginPortal(o);
        }
      } else if (o.k === 'mob') {
        if (o.size < 0 && o.y - this.prog < 1100) {
          o.size = Math.max(4, Math.round(this.squad * (o.scale || 0.4)) + 3);
        }
        if (!o.dead && prev < o.y && this.prog >= o.y) {
          var span = this.mobSpan(o);
          if (this.formationOverlaps(span)) {
            o.dead = true;
            this.hitMob(o);
          }
        }
      } else if (o.k === 'portal') {
        if (!o.dead && prev < o.y && this.prog >= o.y) {
          if (this.formationOverlaps(this.mobSpan(o))) this.hitPortal(o);
          o.dead = true;
        }
      } else if (o.k === 'saw') {
        o.ph += dt * o.spd * 2.2;
        if (!o.hit && this.inv <= 0 && Math.abs(o.y - this.prog) < 34) {
          if (this.formationOverlaps([this.sawX(o, 0) - 14, this.sawX(o, 0) + 14]) ||
            this.formationOverlaps([this.sawX(o, 1) - 14, this.sawX(o, 1) + 14])) {
            o.hit = true;
            this.chip(Math.max(3, Math.round(this.squad * 0.14)), 'saw', 0.7);
          }
        }
      } else if (o.k === 'barricade') {
        if (!o.hit && prev < o.y && this.prog >= o.y) {
          var bs = o.side === 'L' ? [ROAD_L, MID] : [MID, ROAD_R];
          if (this.formationOverlaps(bs)) {
            o.hit = true;
            this.chip(Math.max(3, Math.round(this.squad * 0.12)), 'barricade', 0.6);
          }
        }
      } else if (o.k === 'recruit') {
        if (!o.hit && prev < o.y && this.prog >= o.y) {
          var rs = o.side === 'L' ? [ROAD_L, MID] : [MID, ROAD_R];
          if (this.formationOverlaps(rs)) {
            o.hit = true;
            this.squad = AG.clamp(this.squad + o.v, 0, AG.MAX_SQUAD);
            this.passT = 0.3;
            this.pops.pop(this.rx, SQUAD_Y - 74, '+' + o.v, '#a9f5cd', 26);
            this.pGate.setParticleTint(0x7ee0a8);
            this.pGate.explode(14, this.rx, SQUAD_Y - 30);
            AG.kit.audio.sfx('recruit', { volume: 0.7 });
            this.chips.push('+' + o.v + ' recruits', '#7ee0a8', 'ico_squad');
          }
        }
      }
    }

    if (this.squad > AG.MAX_SQUAD) this.squad = AG.MAX_SQUAD;
    if (this.squad <= 0) { this.squad = 0; this.wiped = true; this.finishRun(); return; }
    if (this.prog >= this.len) {
      if (this.finalGate && this.finalGate.state !== 'spent') this.prog = this.len - 1;
      else this.finishRun();
    }
  };

  RunScene.prototype.applyGate = function (op) {
    var before = this.squad;
    this.squad = AG.applyGateOp(this.squad, op);
    var d = this.squad - before;
    this.gatesTaken++;
    if (d > this.bestGate) this.bestGate = d;
    this.passT = 0.34;
    this.hudDeltaT = 0.9;
    AG.ui.setText(this.hudDelta, (d >= 0 ? '+' : '') + d);
    AG.ui.setColor(this.hudDelta, d >= 0 ? '#7ee0a8' : '#ff6b6b');
    this.pops.pop(this.rx, SQUAD_Y - 84, (d >= 0 ? '+' : '') + d, d >= 0 ? '#a9f5cd' : '#ff9aa2', 30);
    if (d >= 0) {
      this.pGate.setParticleTint(0x7ee0a8);
      this.pGate.explode(22, this.rx, SQUAD_Y - 34);
      this.pRing.setParticleTint(0x7ee0a8);
      this.pRing.explode(1, this.rx, SQUAD_Y - 34);
      AG.kit.audio.sfx('gate_good', { volume: 0.8 });
      if (!AG.ui.reduced) AG.kit.juice.shake(3, 90);
    } else {
      this.pGate.setParticleTint(0xff6b6b);
      this.pGate.explode(16, this.rx, SQUAD_Y - 34);
      this.pSmoke.explode(5, this.rx, SQUAD_Y - 20);
      AG.kit.audio.sfx('gate_bad', { volume: 0.8 });
      this.hurtT = 0.3;
      if (!AG.ui.reduced) { AG.kit.juice.shake(8, 180); AG.kit.juice.hitStop(60); }
    }
    if (this.tutorialActive && !AG.saveData.tutorial.portal) {
      AG.saveData.tutorial.portal = true;
      AG.kit.save.set(AG.saveData);
      this.coach.say('The gate opened a portal. Shift wide to evade its rush.', 2.8);
    }
  };

  RunScene.prototype.beginPortal = function (gate) {
    this.portalGate = gate;
    this.portalRound++;
    this.portalSpawnI = 0;
    this.portalSpawnLeft = gate.final ? 4 : 2;
    this.portalSpawnT = 0.05;
    this.pRing.setParticleTint(0xffd479);
    this.pRing.explode(1, this.sx, SQUAD_Y - 42);
    AG.kit.audio.sfx('telegraph', { volume: 0.52, rate: gate.final ? 0.82 : 1 });
    this.chips.push(gate.final ? 'FINAL PORTAL' : 'PORTAL OPEN', '#ffd479', 'ico_wave');
  };

  RunScene.prototype.hitMob = function (o) {
    var loss = Math.min(this.squad, o.size);
    this.squad -= loss;
    this.hurtT = 0.45; this.inv = 0.5;
    this.pops.pop(this.rx, SQUAD_Y - 84, '-' + loss, '#ff9aa2', 30);
    this.pImpact.setParticleTint(0xff6b6b);
    this.pImpact.explode(20, this.rx, SQUAD_Y - 26);
    this.pSmoke.explode(6, this.rx, SQUAD_Y - 20);
    AG.kit.audio.sfx('mob', { volume: 0.85 });
    this.chips.push('-' + loss + ' lost', '#ff6b6b', 'ico_wave');
    if (!AG.ui.reduced) { AG.kit.juice.shake(11, 240); AG.kit.juice.hitStop(80); }
  };

  RunScene.prototype.hitPortal = function (o) {
    var loss = Math.min(this.squad, Math.max(2, Math.round(o.size * 0.55)));
    this.squad -= loss;
    this.hurtT = 0.5; this.inv = 0.65; this.evadeT = 0;
    this.pops.pop(this.sx, SQUAD_Y - 88, '-' + loss, '#ff9aa2', 28);
    this.pImpact.setParticleTint(0xffd479);
    this.pImpact.explode(18, this.sx, SQUAD_Y - 28);
    AG.kit.audio.sfx('mob', { volume: 0.75, rate: 1.15 });
    this.chips.push('Portal breach -' + loss, '#ff6b6b', 'ico_wave');
    if (!AG.ui.reduced) { AG.kit.juice.shake(9, 200); AG.kit.juice.hitStop(70); }
  };

  RunScene.prototype.chip = function (loss, kind, inv) {
    loss = Math.min(this.squad, loss);
    this.squad -= loss;
    this.inv = inv; this.hurtT = 0.3;
    this.pops.pop(this.rx, SQUAD_Y - 74, '-' + loss, '#ffc48a', 24);
    this.pImpact.setParticleTint(kind === 'saw' ? 0xffa04d : 0xd8b070);
    this.pImpact.explode(12, this.rx, SQUAD_Y - 20);
    AG.kit.audio.sfx(kind === 'saw' ? 'saw' : 'wall_thud', { volume: 0.6 });
    if (!AG.ui.reduced) AG.kit.juice.shake(7, 160);
  };

  RunScene.prototype.mobSpan = function (o) {
    if (o.side === 'L') return [ROAD_L, MID];
    if (o.side === 'R') return [MID, ROAD_R];
    return [ROAD_L, ROAD_R];
  };
  RunScene.prototype.formationOverlaps = function (span) {
    var half = AG.clamp(24 + Math.sqrt(Math.max(0, this.squad)) * 3.3, 30, 94);
    var left = this.sx - half, right = this.sx + half;
    return right >= span[0] && left <= span[1];
  };
  RunScene.prototype.sawX = function (o, idx) {
    var amp = (ROAD_R - ROAD_L) / 2 - 42;
    return MID + Math.sin(o.ph + idx * Math.PI) * amp;
  };

  RunScene.prototype.finishRun = function () {
    if (this.phase === 'outro') return;
    this.phase = 'outro';
    this.outroT = 1.6;
    AG.session.squad = this.squad;
    if (this.squad > AG.session.bestSquad) AG.session.bestSquad = this.squad;
    if (this.wiped) {
      AG.kit.audio.sfx('defeat', { volume: 0.9 });
      this.banner.show({ boundary: true, title: 'SQUAD WIPED', sub: 'The road took all of them.', color: '#ff6b6b', hold: 1.6 });
    } else {
      AG.kit.audio.sfx('victory', { volume: 0.7 });
      this.pRing.setParticleTint(0xffd479);
      this.pRing.explode(1, this.rx, SQUAD_Y - 40);
      this.banner.show({
        boundary: true, title: String(this.squad) + ' AT THE WALL',
        sub: this.road ? 'Road cleared' : 'They become your troop budget', color: '#7ee0a8', hold: 1.6
      });
    }
  };

  /* --------------------------------------------------------- render */
  RunScene.prototype.render = function (dtSec) {
    var i, o, sy, site = this.siteDef;
    this.roadTile.tilePositionY = -this.prog;

    // The simulation position is authoritative for both collision and art.
    // This removes a visible formation/logic mismatch during fast drags.
    this.rx = this.sx;

    // landmark
    var ly = SQUAD_Y - (this.landmarkAt - this.prog);
    if (ly > -520 && ly < DH + 400) {
      this.landmark.setVisible(true);
      this.landmark.y = ly + Math.sin(this.viewTime * 1.7) * 4;
      this.landmark.setAlpha(0.82 + Math.sin(this.viewTime * 2.1) * 0.08);
    } else if (this.landmark.visible) this.landmark.setVisible(false);

    // finish
    var fy = SQUAD_Y - (this.len - this.prog);
    if (fy > -260) {
      this.finish.setVisible(true).setY(fy);
      this.finishWall.setVisible(true).setY(fy - 16);
    } else if (this.finish.visible) { this.finish.setVisible(false); this.finishWall.setVisible(false); }

    // free lists
    var free = { gate: 0, mob: 0, saw: 0, barricade: 0, recruit: 0, portal: 0 };
    var nearestGate = null, nearestDy = 1e9;
    for (i = 0; i < this.objs.length; i++) {
      o = this.objs[i];
      if (o.k !== 'gate' || o.state === 'spent') continue;
      var dy = o.y - this.prog;
      if (dy >= -20 && dy < nearestDy) { nearestDy = dy; nearestGate = o; }
    }

    for (i = 0; i < this.objs.length; i++) {
      o = this.objs[i];
      sy = SQUAD_Y - (o.y - this.prog);
      if (sy < -260 || sy > DH + 160) continue;
      var pool = this.views[o.k];
      if (!pool || free[o.k] >= pool.length) continue;
      var v = pool[free[o.k]++];
      if (o.k === 'gate') this.paintGate(v, o, sy, o === nearestGate);
      else if (o.k === 'mob') this.paintMob(v, o, sy);
      else if (o.k === 'saw') this.paintSaw(v, o, sy);
      else if (o.k === 'barricade') this.paintBarricade(v, o, sy);
      else if (o.k === 'recruit') this.paintRecruit(v, o, sy);
      else if (o.k === 'portal') this.paintPortal(v, o, sy);
    }
    // hide the unused tail of every pool
    var keys = ['gate', 'mob', 'saw', 'barricade', 'recruit', 'portal'];
    for (i = 0; i < keys.length; i++) {
      var arr = this.views[keys[i]];
      for (var j = free[keys[i]]; j < arr.length; j++) {
        if (arr[j].c.visible) arr[j].c.setVisible(false);
      }
    }

    this.paintSquad(dtSec);

    // HUD
    AG.ui.setText(this.hudCount, String(this.squad));
    this.progMeter.set(this.prog / this.len);
    this.squadMeterMax = Math.max(this.squadMeterMax, this.squad, 1);
    this.squadMeter.set(this.squad / this.squadMeterMax,
      this.squad < this.squadMeterMax * 0.36 ? 0xff6b6b : site.accent);
    if (this.hudDeltaT > 0) {
      this.hudDeltaT -= dtSec;
      this.hudDelta.setAlpha(AG.clamp(this.hudDeltaT / 0.4, 0, 1));
    } else if (this.hudDelta.alpha !== 0) this.hudDelta.setAlpha(0);

    // damage vignette
    var vA = this.hurtT > 0 ? Math.min(0.55, this.hurtT * 1.6) : 0;
    if (Math.abs(this.vign.alpha - vA) > 0.01) this.vign.setAlpha(vA);
  };

  RunScene.prototype.paintGate = function (v, o, sy, isNearest) {
    v.c.setVisible(true).setY(sy);
    var self = this;
    function half(slab, lip, lab, pre, op, onIt) {
      var good = AG.opGood(op);
      var tint = good ? 0x3fd18a : 0xe8515f;
      AG.ui.setTint(slab, tint);
      AG.ui.setTint(lip, tint);
      var spent = o.state === 'spent';
      slab.setAlpha(spent ? 0.10 : (onIt ? 0.40 : 0.22));
      lip.setAlpha(spent ? 0.25 : 1);
      AG.ui.setText(lab, AG.opLabel(op));
      AG.ui.setColor(lab, good ? '#a9f5cd' : '#ffb3ba');
      lab.setAlpha(spent ? 0.3 : 1);
      // INSTANT gate-value preview: the resulting roster, not the operator
      if (isNearest && !spent) {
        var res = AG.applyGateOp(self.squad, op);
        AG.ui.setText(pre, String(res));
        AG.ui.setColor(pre, res >= self.squad ? '#d8ffe8' : '#ffd0d4');
        pre.setAlpha(onIt ? 1 : 0.65);
        pre.setScale(onIt ? 1.14 : 1);
        AG.ui.setVis(pre, true);
      } else AG.ui.setVis(pre, false);
    }
    var onLeft = this.sx < MID;
    half(v.slabL, v.lipL, v.labL, v.preL, o.L, isNearest && onLeft);
    half(v.slabR, v.lipR, v.labR, v.preR, o.R, isNearest && !onLeft);
  };

  RunScene.prototype.paintMob = function (v, o, sy) {
    v.c.setVisible(true).setY(sy);
    if (o.dead) { v.c.setVisible(false); return; }
    var span = this.mobSpan(o), w = span[1] - span[0];
    v.slab.setDisplaySize(w - 8, 84);
    v.slab.x = (span[0] + span[1]) / 2 - DW / 2;
    var n = Math.max(2, Math.min(8, Math.round(w / 58)));
    for (var i = 0; i < v.foes.length; i++) {
      var f = v.foes[i];
      if (i >= n) { if (f.visible) f.setVisible(false); continue; }
      f.setVisible(true);
      f.x = span[0] + (w / n) * (i + 0.5) - DW / 2;
      f.y = -30 + Math.sin(this.viewTime * 4 + i) * 3;
    }
    AG.ui.setText(v.count, o.size >= 0 ? String(o.size) : '?');
    v.count.x = (span[0] + span[1]) / 2 - DW / 2;
    AG.ui.setColor(v.count, (o.size >= 0 && o.size < this.squad) ? '#ffd479' : '#ffb3ba');
  };

  RunScene.prototype.paintPortal = function (v, o, sy) {
    v.c.setVisible(!o.dead).setY(sy);
    if (o.dead) return;
    var pulse = 0.84 + Math.sin(this.viewTime * 8 + o.y * 0.01) * 0.12;
    var span = this.mobSpan(o), center = (span[0] + span[1]) / 2 - DW / 2;
    v.c.x = center + DW / 2;
    v.core.setScale(pulse).setTint(o.portalFor && o.portalFor.final ? 0xff6b6b : 0xffd479);
    v.arc.setTint(0xa9f5cd).setAlpha(0.55 + pulse * 0.25);
  };

  RunScene.prototype.paintSaw = function (v, o, sy) {
    v.c.setVisible(true).setY(sy);
    v.a.x = this.sawX(o, 0) - DW / 2;
    v.b.x = this.sawX(o, 1) - DW / 2;
    var rot = o.ph * 3;
    v.a.rotation = rot; v.b.rotation = -rot;
  };

  RunScene.prototype.paintBarricade = function (v, o, sy) {
    v.c.setVisible(true).setY(sy);
    var span = o.side === 'L' ? [ROAD_L, MID] : [MID, ROAD_R];
    v.img.x = (span[0] + span[1]) / 2 - DW / 2;
    v.img.setAlpha(o.hit ? 0.35 : 1);
  };

  RunScene.prototype.paintRecruit = function (v, o, sy) {
    v.c.setVisible(true).setY(sy);
    var span = o.side === 'L' ? [ROAD_L, MID] : [MID, ROAD_R];
    v.img.x = (span[0] + span[1]) / 2 - DW / 2;
    v.lab.x = v.img.x;
    v.img.setAlpha(o.hit ? 0.2 : 1);
    AG.ui.setText(v.lab, '+' + o.v);
    AG.ui.setVis(v.lab, !o.hit);
  };

  RunScene.prototype.paintSquad = function (dtSec) {
    var show = Math.min(MAX_SOLDIERS, this.squad);
    var t = this.viewTime;
    var frame = this.evadeT > 0 ? 'sol_evade' : (this.passT > 0 ? 'sol_pass' : (this.hurtT > 0 ? 'sol_hurt' : null));
    var blink = this.inv > 0 && Math.floor(this.inv * 16) % 2 === 1;
    var perRow = 6, spread = 17 + Math.min(9, this.squad / 26);
    var dense = this.squad > show;
    for (var d = 0; d < this.densitySilhouettes.length; d++) {
      var ds = this.densitySilhouettes[d];
      if (!dense) { ds.setVisible(false); continue; }
      var dkey = 'sol_run' + (d % 4);
      if (ds.texture.key !== dkey) ds.setTexture(dkey);
      ds.setVisible(true);
      ds.setPosition(this.sx + (d - 1) * 56, SQUAD_Y + 34 + d * 5);
      ds.setScale(1.25 + Math.min(0.6, this.squad / 500));
      ds.setAlpha(0.16 + Math.min(0.14, this.squad / 1800));
    }
    for (var i = 0; i < this.soldiers.length; i++) {
      var sp = this.soldiers[i];
      if (i >= show) { if (sp.visible) sp.setVisible(false); continue; }
      var row = Math.floor(i / perRow), col = i % perRow;
      var ox = (col - (perRow - 1) / 2) * spread + (row % 2 ? spread / 2 : 0);
      var oy = row * 15;
      var wob = Math.sin(t * 9 + i * 1.3) * 2.4;
      sp.setVisible(!blink);
      sp.x = this.rx + ox;
      sp.y = SQUAD_Y + oy + wob;
      sp.setDepth(30 + row);
      var key = frame || ('sol_run' + (Math.floor(t * 10 + i * 0.7) % 4));
      if (sp.texture.key !== key) sp.setTexture(key);
    }
    // lead marker: which gate half the column is currently committed to
    this.leadMark.x = this.rx;
    this.leadMark.y = SQUAD_Y - 44;
    this.leadMark.setAlpha(0.55);
    this.pDust.setPosition(this.sx, SQUAD_Y + 22);
  };

  /* ---------------------------------------------------------- update */
  RunScene.prototype.update = function (time, delta) {
    AG.input.poll();
    var fx = AG.kit.juice.frame();
    if (AG.kit.paused) return;
    var viewDt = fx.frozen ? 0 : delta / 1000;
    this.viewTime += viewDt;

    if (this.phase === 'intro') {
      this.introT -= delta / 1000;
      // the cosmetic clock is the SAME fixed-step clock as the sim, so no
      // animation can ever run ahead of the simulation
      this.stepper.steps(delta);
      // consume steering drag during the intro so the run does not begin
      // with a stale delta already applied
      this.readSteer();
      if (this.introT <= 0) {
        this.phase = 'run';
        this.banner.hide();   // UI_LAW rule 2
        this.pDust.start();
      }
    } else if (this.phase === 'run') {
      var drag = this.readSteer();
      var padX = AG.input.pad && AG.input.pad.connected ? AG.input.pad.x : 0;
      this.sx += drag * 1.12 + padX * 7;
      if (Math.abs(drag) > 0.7 || Math.abs(padX) > 0.25) this.evadeT = Math.max(this.evadeT, 0.18);
      if ((Math.abs(drag) > 0.7 || Math.abs(padX) > 0.25) && this.tutorialActive && AG.markTutorial) AG.markTutorial('evade');
      this.sx = AG.clamp(this.sx, ROAD_L + 24, ROAD_R - 24);
      var n = this.stepper.steps(delta);
      for (var i = 0; i < n; i++) {
        this.step();
        if (this.phase !== 'run') break;
      }
    } else if (this.phase === 'outro') {
      this.outroT -= delta / 1000;
      this.stepper.steps(delta);
      this.readSteer();
      if (this.outroT <= 0) { this.phase = 'done'; AG.orchestrator.afterRun(this.wiped); return; }
    }

    this.cam.setScroll(fx.dx, fx.dy);
    this.render(viewDt);
    this.pops.update(viewDt);
    this.banner.update(viewDt);
    this.coach.pump(this.banner.live);
    this.coach.update(viewDt);
    // ONE transient at a time: chips wait behind the banner and the strip
    if (!this.coach.live && !this.banner.live) this.chips.update(viewDt);
    this.syncHook();
  };

  RunScene.prototype.syncHook = function () {
    var h = window.__ag;
    if (!h) return;
    var st = h.state;
    st.scene = 'run';
    st.mode = AG.session.mode;
    st.site = this.siteDef.id;
    st.road = this.road ? this.road.id : null;
    st.squad = this.squad;
    st.wave = AG.session.wave;
    st.wallHP = AG.session.wallHP;
    st.wallMax = AG.session.wallMax;
    st.phase = this.phase;
    st.progress = this.len ? this.prog / this.len : 0;
    st.squadHealth = this.squadMeterMax ? this.squad / this.squadMeterMax : 1;
    var g = null, best = 1e9;
    for (var i = 0; i < this.objs.length; i++) {
      var o = this.objs[i];
      if (o.k !== 'gate' || o.state === 'spent') continue;
      var dy = o.y - this.prog;
      if (dy >= -20 && dy < best) { best = dy; g = o; }
    }
    st.enemies = 0;
    st.garrison = 0;
    st.troops = AG.session.troops;
    st.gate = g ? {
      left: AG.opLabel(g.L), right: AG.opLabel(g.R),
      leftResult: AG.applyGateOp(this.squad, g.L), rightResult: AG.applyGateOp(this.squad, g.R),
      distance: Math.round(best), side: this.sx < MID ? 'L' : 'R'
    } : null;
  };

  AG.RunScene = RunScene;
})();
