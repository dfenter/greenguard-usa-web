/* Aftergate - BASE scene: garrison the wall, hold the wave.
 *
 * The wave plan is built when the BUILD phase opens, not when the wave
 * starts, so the threat direction per wall segment is readable before you
 * spend a single soldier.
 */
'use strict';
var AG = window.AG || {};
window.AG = AG;

(function () {
  var DW = AG.DW, DH = AG.DH;
  var COLS = 5;
  var MAX_ENEM = 52, MAX_SHOT = 80;

  function BaseScene() { Phaser.Scene.call(this, { key: 'Base' }); }
  BaseScene.prototype = Object.create(Phaser.Scene.prototype);
  BaseScene.prototype.constructor = BaseScene;

  BaseScene.prototype.init = function () {
    var s = AG.session;
    this.siteDef = AG.site(s.siteId);
    this.troops = s.troops | 0;
    this.wallMax = s.wallMax || this.siteDef.wallMax;
    this.wallHP = s.wallHP > 0 ? s.wallHP : this.wallMax;
    this.wave = s.wave | 0 || 1;
    this.sel = 'spear';
    this.cursor = 0;
    this.kbd = false;
    this.phase = 'build';
    this.enem = []; this.shots = []; this.enemyShots = []; this.plan = [];
    this.spawnI = 0; this.spawnT = 0;
    this.dragSessions = Object.create(null);
    this.dragGhosts = [];
    this.nextEnemyId = 1;
    this.stepper = new AG.ui.Stepper(4);
    this.outcome = null;
    this.result = null;
    this.waveHeldThisSite = 0;
    this._crackedA = false; this._crackedB = false;
    this.waveTimer = 0; this.waveTimerMax = 0; this.waveTimedOut = false;
    this.guardX = DW / 2; this.guardTargetX = DW / 2;
    this.guardInv = 0; this.guardEvadeT = 0; this.playerHP = 3; this.playerMaxHP = 3;
    this.playerState = 'idle'; this.playerStateT = 0;
    this.viewTime = 0; this.dangerMusic = false;
  };

  /* -------------------------------------------------------- geometry */
  BaseScene.prototype.layout = function () {
    var top = AG.ui.safe.top, bottom = DH - AG.ui.safe.bottom;
    this.FIELD_TOP = top + 88;
    this.readyY = bottom - 48;
    this.trayY = this.readyY - 84;
    this.row1Y = this.trayY - 78;
    this.row0Y = this.row1Y - 84;
    this.WALL_Y = this.row0Y - 62;
    this.colX = [];
    for (var i = 0; i < COLS; i++) this.colX.push(66 + i * 102);
    this.slotW = 96; this.slotH = 78;
  };

  /* --------------------------------------------------------- create */
  BaseScene.prototype.create = function () {
    this.cameras.main.setZoom(AG.RETINA_FACTOR);
    var self = this, i, site = this.siteDef;
    this.cam = this.cameras.main;
    this.cam.setBackgroundColor(site.sky);
    AG.input.clear();
    this.layout();

    /* --- field --- */
    this.ground = this.add.image(DW / 2, this.FIELD_TOP, 'ground_' + site.id).setOrigin(0.5, 0)
      .setDisplaySize(DW, this.WALL_Y - this.FIELD_TOP + 14).setDepth(0);
    this.lanes = [];
    for (i = 0; i < COLS; i++) {
      var l = this.add.image(this.colX[i], this.FIELD_TOP, 'px').setOrigin(0.5, 0)
        .setDisplaySize(98, this.WALL_Y - this.FIELD_TOP)
        .setAlpha(i % 2 ? 0.030 : 0.055).setDepth(1);
      this.lanes.push(l);
    }
    // depth 16 keeps it ABOVE the marching column so foes fade in out of the
    // haze instead of popping over the HUD
    this.horizon = this.add.image(DW / 2, this.FIELD_TOP, 'fog_' + site.id).setOrigin(0.5, 0)
      .setDisplaySize(DW, 76).setDepth(16);

    /* --- wall --- */
    this.wall = this.add.image(DW / 2, this.WALL_Y, 'wall_' + site.id).setOrigin(0.5, 0).setDepth(20);
    this.cracks = [];
    for (i = 0; i < 5; i++) {
      var cr = this.add.image(60 + i * 105, this.WALL_Y + 44, 'wall_crack').setDepth(21).setVisible(false).setAlpha(0.9);
      this.cracks.push(cr);
    }

    /* --- slots --- */
    this.slots = [];
    for (var row = 0; row < 2; row++) {
      for (i = 0; i < COLS; i++) {
        var cx = this.colX[i], cy = row === 0 ? this.row0Y : this.row1Y;
        var v = {};
        v.frame = this.add.nineslice(cx, cy, 'slot_frame', null, this.slotW, this.slotH, 12, 12, 12, 12).setDepth(24);
        v.glow = this.add.nineslice(cx, cy, 'slot_fill', null, this.slotW - 6, this.slotH - 6, 12, 12, 12, 12).setDepth(23).setAlpha(0);
        v.plus = this.add.image(cx, cy, 'slot_plus').setDepth(25).setScale(0.55).setTint(0x3a4557);
        v.body = this.add.image(cx, cy + 4, 'sol_garrison').setDepth(26).setScale(1.5).setVisible(false);
        v.icon = this.add.image(cx, cy - 22, 'ico_spear').setDepth(27).setScale(0.6).setVisible(false);
        v.pips = [];
        for (var p = 0; p < 3; p++) {
          v.pips.push(this.add.image(cx - 14 + p * 14, cy + this.slotH / 2 - 12, 'lvl_pip')
            .setDepth(27).setScale(0.8).setVisible(false));
        }
        this.slots.push({
          x: cx, y: cy, row: row, col: i, role: null, lvl: 0, cd: 0, fire: 0, v: v
        });
      }
    }
    this.rangeRing = this.add.image(0, 0, 'ring_spear').setDepth(19).setAlpha(0).setVisible(false);

    /* --- threat indicators per wall segment --- */
    this.threat = [];
    for (i = 0; i < COLS; i++) {
      var t = {};
      t.chev = this.add.image(this.colX[i], this.FIELD_TOP + 22, 'threat_chev').setDepth(17).setAlpha(0);
      t.pips = [];
      for (var q = 0; q < 5; q++) {
        t.pips.push(this.add.image(this.colX[i] - 30 + q * 12, this.FIELD_TOP + 46, 'lvl_pip')
          .setDepth(17).setScale(0.65).setVisible(false));
      }
      t.more = AG.ui.label(this, this.colX[i] + 30, this.FIELD_TOP + 46, '', 14, '#ffb3ba');
      t.more.setDepth(15).setVisible(false);
      this.threat.push(t);
    }

    /* --- pools --- */
    this.eView = [];
    for (i = 0; i < MAX_ENEM; i++) {
      var ev = {
        img: this.add.image(0, 0, 'foe_grunt').setDepth(12).setVisible(false),
        barBg: this.add.image(0, 0, 'px').setDisplaySize(28, 5).setTint(0x0b0d12).setDepth(13).setVisible(false),
        barFg: this.add.image(0, 0, 'px').setDisplaySize(26, 3).setTint(0xff6b6b).setDepth(14).setVisible(false).setOrigin(0, 0.5),
        warn: this.add.image(0, 0, 'telegraph_melee').setDepth(15).setVisible(false)
      };
      this.eView.push(ev);
    }
    this.sView = [];
    for (i = 0; i < MAX_SHOT; i++) {
      this.sView.push(this.add.image(0, 0, 'shot_arrow').setDepth(18).setVisible(false));
    }
    this.enemyShotView = [];
    this.trailView = [];
    for (i = 0; i < 32; i++) this.enemyShotView.push(this.add.image(0, 0, 'shot_enemy').setDepth(18).setVisible(false));
    for (i = 0; i < 120; i++) this.trailView.push(this.add.image(0, 0, 'shot_trail').setDepth(17).setVisible(false));

    /* --- particles --- */
    this.pHit = this.add.particles(0, 0, 'p_spark', { lifespan: 380, speed: { min: 40, max: 200 }, scale: { start: 0.8, end: 0 }, emitting: false, blendMode: 'ADD' }).setDepth(30);
    this.pStone = this.add.particles(0, 0, 'p_chip', { lifespan: 800, speed: { min: 60, max: 260 }, gravityY: 700, scale: { start: 1.1, end: 0.3 }, rotate: { min: 0, max: 360 }, tint: 0x9aa4b4, emitting: false }).setDepth(30);
    this.pFire = this.add.particles(0, 0, 'p_ember', { lifespan: 620, speed: { min: 30, max: 150 }, scale: { start: 1.4, end: 0 }, tint: [0xffd479, 0xff8a3c], emitting: false, blendMode: 'ADD' }).setDepth(30);
    this.pRepair = this.add.particles(0, 0, 'p_dot', { lifespan: 900, speedY: { min: -90, max: -30 }, speedX: { min: -40, max: 40 }, scale: { start: 0.9, end: 0 }, tint: 0x7ee0a8, emitting: false, blendMode: 'ADD' }).setDepth(30);
    this.pRing = this.add.particles(0, 0, 'p_ring', { lifespan: 450, speed: 0, scale: { start: 0.2, end: 1.6 }, alpha: { start: 0.9, end: 0 }, emitting: false, blendMode: 'ADD' }).setDepth(31);

    /* --- role tray (controls hug the bottom, >=44px targets) --- */
    this.roleBtns = [];
    for (i = 0; i < AG.ROLE_KEYS.length; i++) {
      var rk = AG.ROLE_KEYS[i], role = AG.role(rk);
      var b = new AG.ui.Button(this, {
        x: 96 + i * 174, y: this.trayY, w: 164, h: 76,
        icon: role.icon, iconX: -52, iconScale: 0.8,
        text: role.name, textX: 16, textY: -12, size: 21, color: role.css,
        sub: String(role.cost), texture: 'btn9'
      });
      b.setDepth(40);
      b.role = rk;
      this.roleBtns.push(b);
    }
    this.readyBtn = new AG.ui.Button(this, {
      x: DW / 2, y: this.readyY, w: DW - 28, h: 68,
      text: 'START WAVE', size: 24, color: '#a9f5cd', texture: 'btn9', tint: 0x2a5a44
    });
    this.readyBtn.setDepth(40);
    for (i = 0; i < 8; i++) {
      this.dragGhosts.push(this.add.image(0, 0, 'sol_garrison').setDepth(60).setScale(1.7).setVisible(false).setAlpha(0.85));
    }

    this.guardRing = this.add.image(0, 0, 'p_ring').setDepth(22).setScale(0.58).setAlpha(0.45).setVisible(false);
    this.guard = this.add.image(0, 0, 'commander_idle').setDepth(23).setOrigin(0.5, 1).setVisible(false);

    /* --- HUD --- */
    var top = AG.ui.safe.top, hy = top + 34;
    this.hudWaveIcon = this.add.image(18, hy, 'ico_wave').setOrigin(0, 0.5).setScale(0.8).setDepth(800);
    this.hudWave = AG.ui.strong(this, 48, hy, '1', 26, '#e8edf5', 0).setDepth(800);
    this.hudWallIcon = this.add.image(122, hy, 'ico_wall').setOrigin(0, 0.5).setScale(0.72).setDepth(800);
    this.hudWallMeter = new AG.ui.Meter(this, 150, hy, 148, 14, 0x223047, 0x7ee0a8);
    this.hudWallMeter.setDepth(800);
    this.hudTroopIcon = this.add.image(DW - 104, hy, 'ico_troop').setOrigin(0, 0.5).setScale(0.8).setDepth(800);
    this.hudTroops = AG.ui.strong(this, DW - 18, hy, '0', 28, '#7ee0a8', 1).setDepth(800);
    this.hudTimer = AG.ui.strong(this, DW / 2, hy + 30, '', 18, '#ffd479').setDepth(800);
    this.hudPlayer = AG.ui.strong(this, 18, hy + 30, '', 17, '#a9f5cd', 0).setDepth(800);

    this.chips = new AG.ui.Chips(this, DW - 16, top + 76, 1);
    this.coach = new AG.ui.Coach(this); this.coach.place(top + 76);
    this.banner = new AG.ui.Banner(this);
    this.pops = new AG.ui.Popups(this, 14);
    this.vign = this.add.image(DW / 2, DH / 2, 'vign').setDisplaySize(DW, DH).setDepth(860).setAlpha(0).setScrollFactor(0);
    this.hurtT = 0;

    AG.kit.audio.music('mus_wall', 900);
    this.openBuild(true);

    var self2 = this;
    this.events.on('shutdown', function () { AG.input.clear(); });
    this.syncHook();
  };

  /* ---------------------------------------------------- wave planning */
  BaseScene.prototype.openBuild = function (first) {
    this.phase = 'build';
    this.spawnI = 0;
    this.plan.length = 0;
    var site = this.siteDef;
    var rand = AG.rng(this.wave * 7717 + site.num * 131 + 3);
    var n = AG.waveCount(this.wave);
    var hpS = AG.waveHpScale(this.wave);
    this.waveTimerMax = 24 + this.wave * 1.8 + n * 0.12;
    this.waveTimer = this.waveTimerMax;
    this.waveTimedOut = false;
    for (var i = 0; i < n; i++) {
      this.plan.push({
        t: AG.rollWaveType(site.waveMix, rand),
        col: Math.floor(rand() * COLS),
        hpS: hpS
      });
    }
    AG.ui.setText(this.readyBtn.text, 'START WAVE ' + this.wave);
    this.readyBtn.setEnabled(true);
    if (first) {
      this.banner.show({
        boundary: true, title: site.wall.toUpperCase(),
        sub: this.troops + ' troops to spend', color: site.accentCss, hold: 1.6
      });
      if (!AG.saveData.tutorialSeen) {
        this.coach.queue('Pick a role, tap a wall slot, then evade red attacks with Space.', 3.4);
      }
    }
  };

  /* ---------------------------------------------------------- input */
  BaseScene.prototype.handleInput = function () {
    var i, j, p;
    // pointer claims
    for (i = 0; i < AG.input.downs.length; i++) {
      p = AG.input.downs[i];
      var claimed = false;
      for (j = 0; j < this.roleBtns.length && this.phase === 'build'; j++) {
        if (this.roleBtns[j].hit(p.x, p.y)) {
          var roleKey = this.roleBtns[j].role;
          AG.input.claim(p, 'role:' + roleKey);
          this.sel = roleKey; this.kbd = false;
          var ghost = -1;
          for (var gi = 0; gi < this.dragGhosts.length; gi++) {
            if (!this.dragGhosts[gi].visible) { ghost = gi; break; }
          }
          if (ghost >= 0) this.dragGhosts[ghost].setVisible(true);
          this.dragSessions[p.id] = { role: roleKey, x: p.x, y: p.y, ghost: ghost };
          this.roleBtns[j].press(true);
          claimed = true; break;
        }
      }
      if (claimed) continue;
      if (this.phase === 'build' && this.readyBtn.hit(p.x, p.y)) {
        AG.input.claim(p, 'ready'); this.readyBtn.press(true); continue;
      }
      AG.input.claim(p, 'field');
    }
    // Every active pointer owns its role, target and ghost independently.
    for (i = 0; i < AG.input.actives.length; i++) {
      p = AG.input.actives[i];
      var ds = this.dragSessions[p.id];
      if (ds) { ds.x = p.x; ds.y = p.y; }
      if (this.phase === 'fight' && (!p.zone || p.zone === 'field')) this.guardTargetX = AG.clamp(p.x, 42, DW - 42);
    }
    // releases
    for (i = 0; i < AG.input.ups.length; i++) {
      var u = AG.input.ups[i];
      var session = this.dragSessions[u.id];
      if (session) {
        if (session.ghost >= 0) this.dragGhosts[session.ghost].setVisible(false);
        delete this.dragSessions[u.id];
      }
      for (j = 0; j < this.roleBtns.length; j++) this.roleBtns[j].press(false);
      this.readyBtn.press(false);
      if (u.cancelled) continue;
      if (u.zone === 'ready') {
        if (this.phase === 'build' && this.readyBtn.hit(u.x, u.y)) this.startWave();
        continue;
      }
      if (session || (u.zone && u.zone.indexOf('role:') === 0)) {
        // released over a slot: this was a drag-to-garrison
        var si = this.slotAt(u.x, u.y);
        if (si >= 0) { this.cursor = si; this.place(si, session ? session.role : this.sel); }
        else AG.kit.audio.sfx('click', { volume: 0.4 });
        continue;
      }
      // plain tap in the field / on the wall
      var s2 = this.slotAt(u.x, u.y);
      if (this.phase === 'build' && s2 >= 0) { this.cursor = s2; this.place(s2); }
    }
    // keyboard
    if (AG.input.pressed('Digit1')) { this.sel = 'spear'; this.kbd = true; }
    if (AG.input.pressed('Digit2')) { this.sel = 'bow'; this.kbd = true; }
    if (AG.input.pressed('Digit3')) { this.sel = 'oil'; this.kbd = true; }
    if (AG.input.pressed('Tab')) {
      this.sel = AG.ROLE_KEYS[(AG.ROLE_KEYS.indexOf(this.sel) + 1) % AG.ROLE_KEYS.length];
      this.kbd = true;
    }
    if (AG.input.pressed('ArrowLeft')) { this.cursor = (this.cursor + 9) % 10; this.kbd = true; }
    if (AG.input.pressed('ArrowRight')) { this.cursor = (this.cursor + 1) % 10; this.kbd = true; }
    if (AG.input.pressed('ArrowUp') || AG.input.pressed('ArrowDown')) { this.cursor = (this.cursor + 5) % 10; this.kbd = true; }
    var pad = AG.input.pad;
    if (pad && pad.connected && this.phase === 'build') {
      if (pad.leftPressed) { this.cursor = (this.cursor + 9) % 10; this.kbd = true; }
      if (pad.rightPressed) { this.cursor = (this.cursor + 1) % 10; this.kbd = true; }
      if (pad.upPressed || pad.downPressed) { this.cursor = (this.cursor + (pad.upPressed ? 5 : 5)) % 10; this.kbd = true; }
      if (pad.confirmPressed) this.place(this.cursor);
    }
    if (AG.input.pressed('Space')) {
      if (this.phase === 'build') this.place(this.cursor); else this.evade();
    }
    if (AG.input.pressed('Enter')) this.startWave();
    if (pad && pad.connected && pad.evadePressed && this.phase === 'fight') this.evade();
  };

  BaseScene.prototype.slotAt = function (x, y) {
    var pad = 6;
    for (var i = 0; i < this.slots.length; i++) {
      var s = this.slots[i];
      if (x >= s.x - this.slotW / 2 - pad && x <= s.x + this.slotW / 2 + pad &&
        y >= s.y - this.slotH / 2 - pad && y <= s.y + this.slotH / 2 + pad) return i;
    }
    return -1;
  };

  /* legality is one function so the highlight and the action can never
   * disagree with each other */
  BaseScene.prototype.legality = function (slot, roleKey) {
    var role = AG.role(roleKey);
    if (!slot.role) return { ok: this.troops >= role.cost, kind: 'place', cost: role.cost };
    if (slot.role === roleKey) {
      if (slot.lvl >= AG.ROLE_MAX_LVL) return { ok: false, kind: 'max', cost: 0 };
      var c = AG.upgradeCost(roleKey, slot.lvl);
      return { ok: this.troops >= c, kind: 'upgrade', cost: c };
    }
    return { ok: false, kind: 'occupied', cost: 0 };
  };

  BaseScene.prototype.place = function (idx, roleKey) {
    var slot = this.slots[idx];
    if (!slot) return;
    roleKey = roleKey || this.sel;
    var role = AG.role(roleKey);
    var L = this.legality(slot, roleKey);
    if (!L.ok) {
      AG.kit.audio.sfx('deny', { volume: 0.55 });
      if (L.kind === 'max') this.chips.push('Max level', '#ffd479', role.icon);
      else if (L.kind === 'occupied') this.chips.push('Slot taken', '#ff6b6b', role.icon);
      else this.chips.push('Need ' + L.cost, '#ff6b6b', 'ico_troop');
      return;
    }
    this.troops -= L.cost;
    if (L.kind === 'upgrade') {
      slot.lvl++;
      AG.kit.audio.sfx('upgrade', { volume: 0.8 });
      this.pops.pop(slot.x, slot.y - 40, 'LV' + slot.lvl, role.css, 24);
      this.chips.push(role.name + ' LV' + slot.lvl, role.css, role.icon);
    } else {
      slot.role = roleKey; slot.lvl = 1;
      AG.kit.audio.sfx('place', { volume: 0.8 });
      this.pops.pop(slot.x, slot.y - 40, role.name, role.css, 22);
    }
    this.pHit.setParticleTint(role.color);
    this.pHit.explode(14, slot.x, slot.y);
    this.pRing.setParticleTint(role.color);
    this.pRing.explode(1, slot.x, slot.y);
    if (AG.session.mode === 'campaign' && !AG.saveData.tutorialSeen && AG.markTutorial) AG.markTutorial('garrison');
    if (!AG.ui.reduced) AG.kit.juice.shake(3, 80);
  };

  BaseScene.prototype.startWave = function () {
    if (this.phase !== 'build') return;
    this.phase = 'fight';
    // UI_LAW rule 2: no centre banner may survive into live play
    this.banner.hide();
    this.spawnI = 0;
    this.spawnT = 0.35;
    this.waveTimer = this.waveTimerMax;
    this.waveTimedOut = false;
    this.playerHP = this.playerMaxHP;
    this.guardInv = 0; this.guardEvadeT = 0;
    this.readyBtn.setEnabled(false);
    AG.ui.setText(this.readyBtn.text, 'WAVE ' + this.wave);
    AG.kit.audio.sfx('wave_start', { volume: 0.9 });
    this.coach.clear();
  };

  BaseScene.prototype.evade = function () {
    if (this.phase !== 'fight' || this.guardEvadeT > 0) return;
    this.guardEvadeT = 0.34;
    this.guardInv = 0.58;
    this.playerState = 'evade'; this.playerStateT = 0.34;
    if (AG.session.mode === 'campaign' && !AG.saveData.tutorialSeen && AG.markTutorial) AG.markTutorial('wallEvade');
    AG.kit.audio.sfx('evade', { volume: 0.7 });
    this.pRing.setParticleTint(0x7ee0a8);
    this.pRing.explode(1, this.guardX, this.WALL_Y - 40);
    if (!AG.ui.reduced) AG.kit.juice.shake(2, 70);
  };

  BaseScene.prototype.dmgOf = function (slot) {
    var d = AG.role(slot.role);
    return d.dps * d.cd * (1 + (slot.lvl - 1) * 0.7);
  };

  /* ------------------------------------------------------------ sim */
  BaseScene.prototype.step = function () {
    var dt = AG.STEP, i, j, e, s;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.guardInv = Math.max(0, this.guardInv - dt);
    this.guardEvadeT = Math.max(0, this.guardEvadeT - dt);
    this.playerStateT = Math.max(0, this.playerStateT - dt);
    if (this.playerStateT <= 0 && this.guardEvadeT <= 0) this.playerState = 'idle';
    if (this.phase !== 'fight') return;

    this.waveTimer = Math.max(0, this.waveTimer - dt);
    if (this.waveTimer <= 0 && !this.waveTimedOut) {
      this.waveTimedOut = true;
      this.spawnI = this.plan.length;
      this.chips.push('TIMEOUT: LAST THREATS', '#ffd479', 'ico_wave');
    }

    /* spawn */
    if (this.spawnI < this.plan.length) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = Math.max(0.20, 0.62 - this.wave * 0.028);
        var q = this.plan[this.spawnI++];
        var b = AG.etype(q.t);
        if (this.enem.length < MAX_ENEM) {
          this.enem.push({
            t: q.t, col: q.col,
            x: this.colX[q.col] + AG.rnd(-18, 18),
            y: this.FIELD_TOP - AG.rnd(8, 74),
            hp: b.hp * q.hpS, max: b.hp * q.hpS,
            spd: b.spd, dmg: b.dmg, w: b.w, h: b.h,
            flash: 0, atk: 0, attack: b.attack || 'melee', attackState: 'approach',
            attackT: 0, id: this.nextEnemyId++, dead: false, deathT: 0
          });
        }
      }
    }

    /* enemies */
    var wallLine = this.WALL_Y - 16;
    for (i = this.enem.length - 1; i >= 0; i--) {
      e = this.enem[i];
      e.flash = Math.max(0, e.flash - dt * 5);
      if (e.dead) {
        e.deathT -= dt;
        if (e.deathT <= 0) this.enem.splice(i, 1);
        continue;
      }
      if (e.hp <= 0) {
        this.killFoe(e);
        continue;
      }
      if (e.y < wallLine) e.y += e.spd * dt;
      else {
        e.attackT -= dt;
        if (e.attackState === 'approach') {
          e.attackState = 'telegraph';
          e.attackT = e.attack === 'projectile' ? 0.72 : 0.48;
          e.flash = 0.5;
          AG.kit.audio.sfx('telegraph', { volume: 0.25, rate: e.attack === 'projectile' ? 1.05 : 0.9 });
        } else if (e.attackState === 'telegraph' && e.attackT <= 0) {
          if (e.attack === 'projectile') {
            if (this.enemyShots.length < 32) this.enemyShots.push({
              x: e.x, y: e.y - 18, tx: this.guardX, ty: this.WALL_Y - 44,
              t: 0, dur: 0.28, dmg: e.dmg, sourceId: e.id
            });
          } else {
            var guarded = Math.abs(e.x - this.guardX) < 58;
            if (guarded && this.guardInv <= 0) this.playerHit(e.dmg);
            if (!guarded || this.guardInv <= 0) {
              this.damageWall(guarded ? Math.round(e.dmg * 0.45) : e.dmg, e.x);
              if (this.wallHP <= 0) { this.lose(); return; }
            } else {
              this.chips.push('MELEE EVADED', '#a9f5cd', 'ico_squad');
            }
          }
          e.attackState = 'recover'; e.attackT = 0.72;
        } else if (e.attackState === 'recover' && e.attackT <= 0) {
          e.attackState = 'approach'; e.attackT = 0.18;
        }
      }
    }

    /* defenders */
    for (i = 0; i < this.slots.length; i++) {
      s = this.slots[i];
      s.fire = Math.max(0, s.fire - dt * 5);
      if (!s.role) continue;
      s.cd -= dt;
      if (s.cd > 0) continue;
      var def = AG.role(s.role);
      var best = null, bd = 1e9;
      for (j = 0; j < this.enem.length; j++) {
        e = this.enem[j];
        var dx = e.x - s.x, dy = e.y - s.y, d2 = dx * dx + dy * dy;
        if (!e.dead && d2 <= def.range * def.range && d2 < bd) { bd = d2; best = e; }
      }
      if (!best) continue;
      s.cd = def.cd; s.fire = 1;
      this.playerState = 'attack'; this.playerStateT = 0.16;
      if (this.shots.length < MAX_SHOT) {
        this.shots.push({
          x: s.x, y: s.y - 22, tx: best.x, ty: best.y, t: 0,
          dur: s.role === 'spear' ? 0.10 : (s.role === 'bow' ? 0.20 : 0.34),
          dmg: this.dmgOf(s), splash: def.splash, role: s.role, targetId: best.id
        });
      }
      AG.kit.audio.sfx(def.shot, { volume: 0.30, rate: 0.92 + Math.random() * 0.16 });
    }

    /* shots resolve */
    for (i = this.shots.length - 1; i >= 0; i--) {
      var sh = this.shots[i];
      sh.t += dt;
      if (sh.t < sh.dur) continue;
      this.shots.splice(i, 1);
      var role = AG.role(sh.role);
      var target = null;
      for (j = 0; j < this.enem.length; j++) if (this.enem[j].id === sh.targetId) { target = this.enem[j]; break; }
      // The target identity, not the old impact coordinate, is authoritative.
      if (!target || target.dead) continue;
      sh.tx = target.x; sh.ty = target.y;
      if (sh.splash) {
        this.pFire.explode(16, sh.tx, sh.ty);
        for (j = 0; j < this.enem.length; j++) {
          e = this.enem[j];
          var ax = e.x - sh.tx, ay = e.y - sh.ty;
          if (ax * ax + ay * ay <= sh.splash * sh.splash) { e.hp -= sh.dmg; e.flash = 1; }
        }
        AG.kit.audio.sfx('pot', { volume: 0.35 });
      } else {
        target.hp -= sh.dmg; target.flash = 1;
        this.pHit.setParticleTint(role.color);
        this.pHit.explode(5, target.x, target.y);
      }
    }

    /* enemy projectiles: telegraphed, targetable, and dodgeable */
    for (i = this.enemyShots.length - 1; i >= 0; i--) {
      var es = this.enemyShots[i];
      es.t += dt;
      if (es.t < es.dur) continue;
      this.enemyShots.splice(i, 1);
      var nearGuard = Math.abs(es.tx - this.guardX) < 62;
      if (nearGuard && this.guardInv <= 0) {
        this.playerHit(es.dmg);
        this.damageWall(Math.max(4, Math.round(es.dmg * 0.38)), es.tx);
        if (this.wallHP <= 0) { this.lose(); return; }
      } else {
        this.chips.push('PROJECTILE EVADED', '#a9f5cd', 'ico_squad');
        this.pStone.explode(5, es.tx, es.ty);
      }
    }

    if (this.spawnI >= this.plan.length && this.enem.length === 0 && this.enemyShots.length === 0) this.clearWave();
  };

  BaseScene.prototype.killFoe = function (e) {
    var b = AG.etype(e.t);
    e.dead = true; e.deathT = b.threat >= 3 ? 0.18 : 0.12; e.flash = 1;
    this.pHit.setParticleTint(b.color);
    this.pHit.explode(14, e.x, e.y);
    this.pStone.explode(4, e.x, e.y);
    this.pRing.setParticleTint(b.color);
    this.pRing.explode(1, e.x, e.y);
    this.pops.pop(e.x, e.y - b.h - 10, '+' + b.threat, '#ffd479', b.threat >= 3 ? 22 : 18);
    AG.kit.audio.sfx('foe_die', { volume: 0.42, rate: 0.9 + Math.random() * 0.25 });
    if (!AG.ui.reduced) { AG.kit.juice.shake(b.threat >= 3 ? 4 : 2, 90); AG.kit.juice.hitStop(b.threat >= 3 ? 72 : 42); }
  };

  BaseScene.prototype.damageWall = function (dmg, x) {
    this.wallHP = Math.max(0, this.wallHP - dmg);
    this.hurtT = 0.28;
    this.pStone.explode(9, x, this.WALL_Y + 8);
    AG.kit.audio.sfx('wall_thud', { volume: 0.65 });
    if (!AG.ui.reduced) AG.kit.juice.shake(6, 150);
    var frac = this.wallHP / this.wallMax;
    if (frac < 0.62 && !this._crackedA) { this._crackedA = true; AG.kit.audio.sfx('crack', { volume: 0.7 }); this.chips.push('Wall cracking', '#ffd479', 'ico_wall'); }
    if (frac < 0.30 && !this._crackedB) { this._crackedB = true; AG.kit.audio.sfx('crack', { volume: 0.9 }); this.chips.push('Wall failing', '#ff6b6b', 'ico_wall'); }
  };

  BaseScene.prototype.playerHit = function (dmg) {
    if (this.guardInv > 0 || this.phase !== 'fight') return false;
    this.playerHP = Math.max(0, this.playerHP - (dmg >= 24 ? 2 : 1));
    this.guardInv = 0.9;
    this.hurtT = 0.35;
    this.playerState = 'recover'; this.playerStateT = 0.42;
    this.pHit.setParticleTint(0xff6b6b);
    this.pHit.explode(12, this.guardX, this.WALL_Y - 40);
    this.pops.pop(this.guardX, this.WALL_Y - 78, '-' + (dmg >= 24 ? 2 : 1) + ' GUARD', '#ff9aa2', 20);
    AG.kit.audio.sfx('mob', { volume: 0.48, rate: 1.2 });
    if (!AG.ui.reduced) { AG.kit.juice.shake(5, 120); AG.kit.juice.hitStop(45); }
    if (this.playerHP <= 0) {
      this.playerHP = this.playerMaxHP;
      this.damageWall(Math.max(8, Math.round(dmg * 0.8)), this.guardX);
      this.chips.push('GUARD DOWN', '#ff6b6b', 'ico_wall');
      if (this.wallHP <= 0) this.lose();
    }
    return true;
  };

  BaseScene.prototype.clearWave = function () {
    this.phase = 'held';
    this.heldT = 1.8;
    var s = AG.session;
    s.wavesHeld = Math.max(s.wavesHeld, this.wave);
    this.waveHeldThisSite++;
    var pay = AG.wavePayout(this.wave);
    var rep = Math.min(AG.waveRepair(this.wallMax), this.wallMax - this.wallHP);
    this.troops = Math.min(AG.MAX_TROOPS, this.troops + pay);
    this.wallHP += rep;
    if (this.wallHP / this.wallMax > 0.62) this._crackedA = false;
    if (this.wallHP / this.wallMax > 0.30) this._crackedB = false;
    this.pRepair.explode(28, DW / 2, this.WALL_Y + 20);
    this.pRing.setParticleTint(0x7ee0a8);
    this.pRing.explode(1, DW / 2, this.WALL_Y);
    AG.kit.audio.sfx('wave_held', { volume: 0.9 });
    if (rep > 0) AG.kit.audio.sfx('repair', { volume: 0.5 });
    // combat is over: this is a run boundary, so a centre banner is legal
    this.banner.show({
      boundary: true, title: 'WAVE ' + this.wave + ' HELD',
      sub: '+' + pay + ' troops' + (rep > 0 ? ', +' + rep + ' wall' : ''),
      color: '#7ee0a8', hold: 1.7
    });
    AG.session.troops = this.troops;
    AG.session.wallHP = this.wallHP;
  };

  BaseScene.prototype.advance = function () {
    var s = AG.session;
    s.troops = this.troops; s.wallHP = this.wallHP; s.wallMax = this.wallMax;
    s.wave = this.wave;
    s.integrity = this.wallHP / this.wallMax;
    this.outcome = 'held';
    AG.orchestrator.afterWave(this);
  };

  BaseScene.prototype.lose = function () {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.wallHP = 0;
    var s = AG.session;
    s.wallHP = 0; s.troops = this.troops; s.integrity = 0;
    s.wave = this.wave;
    this.pStone.explode(40, DW / 2, this.WALL_Y + 10);
    AG.kit.audio.sfx('defeat', { volume: 0.95 });
    if (!AG.ui.reduced) AG.kit.juice.shake(18, 500);
    this.banner.show({ boundary: true, title: 'THE WALL FALLS', sub: 'Waves held: ' + (this.wave - 1), color: '#ff6b6b', hold: 1.9 });
    this.overT = 2.0;
  };

  /* --------------------------------------------------------- render */
  BaseScene.prototype.render = function (dtSec) {
    var i, j;
    /* wall integrity */
    var frac = AG.clamp(this.wallHP / this.wallMax, 0, 1);
    var tint = frac > 0.55 ? 0x7ee0a8 : (frac > 0.28 ? 0xffd479 : 0xff6b6b);
    this.hudWallMeter.set(frac, tint);
    for (i = 0; i < this.cracks.length; i++) {
      var want = frac < (0.85 - i * 0.16);
      AG.ui.setVis(this.cracks[i], want);
    }
    AG.ui.setText(this.hudTroops, String(this.troops));
    AG.ui.setText(this.hudWave, AG.session.mode === 'endless' ? String(this.wave) : (this.wave + '/10'));
    AG.ui.setText(this.hudTimer, this.phase === 'fight' ? 'THREAT ' + Math.ceil(this.waveTimer) : 'BUILD');
    AG.ui.setColor(this.hudTimer, this.waveTimer < 6 && this.phase === 'fight' ? '#ff6b6b' : '#ffd479');
    AG.ui.setText(this.hudPlayer, 'GUARD ' + this.playerHP + '/' + this.playerMaxHP);
    AG.ui.setColor(this.hudPlayer, this.playerHP === 1 ? '#ff6b6b' : '#a9f5cd');

    /* slot legality highlight */
    var buildPhase = this.phase === 'build';
    for (i = 0; i < this.slots.length; i++) {
      var s = this.slots[i], v = s.v;
      var L = this.legality(s, this.sel);
      var isCur = (i === this.cursor);
      var frameTint, glowA = 0, glowTint = 0xffffff;
      if (s.role) {
        var rr = AG.role(s.role);
        frameTint = isCur && buildPhase ? 0xffd479 : rr.color;
        AG.ui.setVis(v.plus, false);
        AG.ui.setVis(v.body, true);
        AG.ui.setVis(v.icon, true);
        if (v.icon.texture.key !== rr.icon) v.icon.setTexture(rr.icon);
        AG.ui.setTint(v.body, s.fire > 0 ? 0xffffff : rr.color);
        for (j = 0; j < 3; j++) {
          AG.ui.setVis(v.pips[j], j < s.lvl);
          if (j < s.lvl) AG.ui.setTint(v.pips[j], rr.color);
        }
      } else {
        frameTint = isCur && buildPhase ? 0xffd479 : 0x3a4557;
        AG.ui.setVis(v.plus, true);
        AG.ui.setVis(v.body, false);
        AG.ui.setVis(v.icon, false);
        for (j = 0; j < 3; j++) AG.ui.setVis(v.pips[j], false);
      }
      if (buildPhase) {
        if (L.ok && L.kind === 'place') { glowA = 0.16; glowTint = AG.role(this.sel).color; }
        else if (L.ok && L.kind === 'upgrade') { glowA = 0.22; glowTint = 0xffd479; }
        else if (L.kind === 'occupied') { glowA = 0.05; glowTint = 0xff6b6b; }
        else glowA = 0;
        if (Object.keys(this.dragSessions).length) glowA *= 1.9;
      }
      AG.ui.setTint(v.frame, frameTint);
      AG.ui.setTint(v.glow, glowTint);
      if (Math.abs(v.glow.alpha - glowA) > 0.01) v.glow.setAlpha(glowA);
    }

    /* range preview */
    var showRing = buildPhase;
    if (showRing) {
      var cs = this.slots[this.cursor] || this.slots[0];
      var role = AG.role(this.sel);
      var key = 'ring_' + this.sel;
      if (this.rangeRing.texture.key !== key) this.rangeRing.setTexture(key);
      this.rangeRing.setPosition(cs.x, cs.y);
      AG.ui.setTint(this.rangeRing, role.color);
      this.rangeRing.setVisible(true).setAlpha(0.26);
    } else if (this.rangeRing.visible) this.rangeRing.setVisible(false);

    /* role tray state */
    for (i = 0; i < this.roleBtns.length; i++) {
      var b = this.roleBtns[i], rdef = AG.role(b.role);
      var on = this.sel === b.role;
      AG.ui.setTint(b.bg, on ? 0x2c4463 : 0x1d2a3c);
      b.c.setAlpha(this.troops >= rdef.cost ? 1 : 0.5);
      AG.ui.setText(b.sub, String(rdef.cost));
    }
    AG.ui.setVis(this.readyBtn.c, this.phase === 'build');

    /* per-pointer drag ghosts */
    for (i = 0; i < this.dragGhosts.length; i++) this.dragGhosts[i].setVisible(false);
    for (var did in this.dragSessions) {
      var drag = this.dragSessions[did];
      if (drag.ghost < 0) continue;
      var dg = this.dragGhosts[drag.ghost];
      dg.setVisible(true).setPosition(drag.x, drag.y - 26);
      AG.ui.setTint(dg, AG.role(drag.role).color);
    }

    /* threat per wall segment */
    var mass = [0, 0, 0, 0, 0], pending = [0, 0, 0, 0, 0];
    for (i = 0; i < this.enem.length; i++) {
      var e = this.enem[i];
      if (e.dead) continue;
      var c = AG.clamp(Math.round((e.x - 66) / 102), 0, COLS - 1);
      mass[c] += AG.etype(e.t).threat;
    }
    for (i = this.spawnI; i < this.plan.length; i++) {
      var pl = this.plan[i];
      pending[AG.clamp(pl.col, 0, COLS - 1)] += 1;
    }
    var maxMass = 0;
    for (i = 0; i < mass.length; i++) maxMass = Math.max(maxMass, mass[i]);
    var danger = this.phase === 'fight' && (frac < 0.42 || maxMass >= 6 || this.enemyShots.length > 0);
    if (danger !== this.dangerMusic) {
      this.dangerMusic = danger;
      AG.kit.audio.music(danger ? 'mus_wall_danger' : 'mus_wall', 420);
    }
    for (i = 0; i < COLS; i++) {
      var th = this.threat[i];
      var m = mass[i];
      var a = m > 0 ? AG.clamp(0.25 + m * 0.10, 0, 0.9) : 0;
      if (Math.abs(th.chev.alpha - a) > 0.02) th.chev.setAlpha(a);
      if (m > 0) {
        th.chev.setScale(AG.clamp(0.7 + m * 0.06, 0.7, 1.5));
        AG.ui.setTint(th.chev, m >= 6 ? 0xff6b6b : (m >= 3 ? 0xffa04d : 0xffd479));
      }
      var shown = Math.min(5, pending[i]);
      for (j = 0; j < th.pips.length; j++) {
        AG.ui.setVis(th.pips[j], j < shown);
        if (j < shown) AG.ui.setTint(th.pips[j], 0xff6b6b);
      }
      AG.ui.setText(th.more, pending[i] > 5 ? '+' + (pending[i] - 5) : '');
      AG.ui.setVis(th.more, pending[i] > 5);
    }

    /* enemies */
    for (i = 0; i < this.eView.length; i++) {
      var ev = this.eView[i];
      if (i >= this.enem.length) {
        if (ev.img.visible) { ev.img.setVisible(false); ev.barBg.setVisible(false); ev.barFg.setVisible(false); ev.warn.setVisible(false); }
        continue;
      }
      var en = this.enem[i], bt = AG.etype(en.t);
      if (en.y < this.FIELD_TOP - 4) {
        if (ev.img.visible) { ev.img.setVisible(false); ev.barBg.setVisible(false); ev.barFg.setVisible(false); ev.warn.setVisible(false); }
        continue;
      }
      ev.img.setVisible(true).setPosition(en.x, en.y).setAlpha(en.dead ? AG.clamp(en.deathT / 0.18, 0, 1) : 1);
      if (ev.img.texture.key !== bt.sprite) ev.img.setTexture(bt.sprite);
      if (en.flash > 0) { if (!ev.flashed) { ev.img.setTintFill(0xffffff); ev.flashed = true; } }
      else if (ev.flashed) { ev.img.clearTint(); ev.flashed = false; }
      var tele = !en.dead && en.attackState === 'telegraph';
      if (tele) {
        var warnKey = en.attack === 'projectile' ? 'telegraph_projectile' : 'telegraph_melee';
        if (ev.warn.texture.key !== warnKey) ev.warn.setTexture(warnKey);
        ev.warn.setVisible(true).setPosition(en.x, en.y - bt.h / 2 - 22);
        ev.warn.setAlpha(0.55 + Math.sin(this.viewTime * 14) * 0.35);
      } else ev.warn.setVisible(false);
      var hf = AG.clamp(en.hp / en.max, 0, 1);
      var showBar = hf < 0.999;
      ev.barBg.setVisible(showBar); ev.barFg.setVisible(showBar);
      if (showBar) {
        ev.barBg.setPosition(en.x, en.y - bt.h / 2 - 12).setDisplaySize(bt.w + 6, 5);
        ev.barFg.setPosition(en.x - (bt.w + 6) / 2 + 1, en.y - bt.h / 2 - 12).setDisplaySize((bt.w + 4) * hf, 3);
      }
    }

    /* shots */
    var trailCursor = 0;
    for (i = 0; i < this.sView.length; i++) {
      var sv = this.sView[i];
      if (i >= this.shots.length) { if (sv.visible) sv.setVisible(false); continue; }
      var sh = this.shots[i];
      var t = AG.clamp(sh.t / sh.dur, 0, 1);
      var x = AG.lerp(sh.x, sh.tx, t), y = AG.lerp(sh.y, sh.ty, t);
      var texKey = sh.role === 'bow' ? 'shot_arrow' : (sh.role === 'oil' ? 'shot_pot' : 'shot_jab');
      if (sv.texture.key !== texKey) sv.setTexture(texKey);
      sv.setVisible(true).setPosition(x, y);
      sv.rotation = Math.atan2(sh.ty - sh.y, sh.tx - sh.x) + Math.PI / 2;
      AG.ui.setTint(sv, AG.role(sh.role).color);
      for (j = 0; j < 2 && trailCursor < this.trailView.length; j++) {
        var tr = this.trailView[trailCursor++], tt = AG.clamp(t - 0.12 * (j + 1), 0, 1);
        tr.setVisible(true).setPosition(AG.lerp(sh.x, sh.tx, tt), AG.lerp(sh.y, sh.ty, tt));
        tr.rotation = sv.rotation; tr.setAlpha(0.42 - j * 0.14); AG.ui.setTint(tr, AG.role(sh.role).color);
      }
    }
    for (i = 0; i < this.enemyShotView.length; i++) {
      var esv = this.enemyShotView[i];
      if (i >= this.enemyShots.length) { esv.setVisible(false); continue; }
      var es = this.enemyShots[i], et = AG.clamp(es.t / es.dur, 0, 1);
      var ex = AG.lerp(es.x, es.tx, et), ey = AG.lerp(es.y, es.ty, et);
      esv.setVisible(true).setPosition(ex, ey).setTint(0xff6b6b);
      esv.rotation = Math.atan2(es.ty - es.y, es.tx - es.x) + Math.PI / 2;
      if (trailCursor < this.trailView.length) {
        var etr = this.trailView[trailCursor++], ett = AG.clamp(et - 0.18, 0, 1);
        etr.setVisible(true).setPosition(AG.lerp(es.x, es.tx, ett), AG.lerp(es.y, es.ty, ett));
        etr.rotation = esv.rotation; etr.setAlpha(0.45); AG.ui.setTint(etr, 0xff6b6b);
      }
    }
    for (; trailCursor < this.trailView.length; trailCursor++) {
      if (this.trailView[trailCursor].visible) this.trailView[trailCursor].setVisible(false);
    }

    var guardVisible = this.phase === 'fight';
    if (guardVisible) {
      this.guard.setVisible(true).setPosition(this.guardX, this.WALL_Y - 34);
      this.guardRing.setVisible(true).setPosition(this.guardX, this.WALL_Y - 36);
      var guardKey = this.guardEvadeT > 0 ? 'commander_evade' :
        (this.playerState === 'attack' ? 'commander_attack' :
          (this.playerState === 'recover' ? 'commander_recover' : 'commander_idle'));
      if (this.guard.texture.key !== guardKey) this.guard.setTexture(guardKey);
      this.guard.setAlpha(this.guardInv > 0 && Math.floor(this.guardInv * 16) % 2 ? 0.35 : 1);
      this.guardRing.setAlpha(this.guardEvadeT > 0 ? 0.85 : 0.35);
    } else {
      this.guard.setVisible(false); this.guardRing.setVisible(false);
    }

    var vA = this.hurtT > 0 ? Math.min(0.5, this.hurtT * 1.7) : 0;
    if (Math.abs(this.vign.alpha - vA) > 0.01) this.vign.setAlpha(vA);
  };

  /* --------------------------------------------------------- update */
  BaseScene.prototype.update = function (time, delta) {
    AG.input.poll();
    var fx = AG.kit.juice.frame();
    if (AG.kit.paused) return;
    var dtSec = delta / 1000;
    var viewDt = fx.frozen ? 0 : dtSec;
    this.viewTime += viewDt;

    if (this.phase === 'build' || this.phase === 'fight') this.handleInput();

    if (this.phase === 'fight') {
      var axis = 0;
      if (AG.input.down('ArrowLeft') || AG.input.down('KeyA')) axis -= 1;
      if (AG.input.down('ArrowRight') || AG.input.down('KeyD')) axis += 1;
      if (AG.input.pad && AG.input.pad.connected) axis += AG.input.pad.x;
      if (axis) this.guardTargetX = AG.clamp(this.guardTargetX + axis * 250 * dtSec, 42, DW - 42);
      this.guardX += (this.guardTargetX - this.guardX) * Math.min(1, dtSec * 16);
    }

    if (this.phase === 'fight') {
      var n = this.stepper.steps(delta);
      for (var i = 0; i < n; i++) { this.step(); if (this.phase !== 'fight') break; }
    } else if (this.phase === 'held') {
      this.heldT -= dtSec;
      if (this.heldT <= 0) this.advance();
    } else if (this.phase === 'over') {
      this.overT -= dtSec;
      if (this.overT <= 0) { this.phase = 'done'; AG.orchestrator.wallLost(); return; }
    }

    this.cam.setScroll(fx.dx, fx.dy);
    this.render(viewDt);
    this.pops.update(viewDt);
    this.banner.update(viewDt);
    this.coach.pump(this.banner.live);
    this.coach.update(viewDt);
    if (!this.coach.live && !this.banner.live) this.chips.update(viewDt);
    this.syncHook();
  };

  BaseScene.prototype.syncHook = function () {
    var h = window.__ag;
    if (!h) return;
    var st = h.state;
    st.scene = 'base';
    st.mode = AG.session.mode;
    st.site = this.siteDef.id;
    st.road = null;
    st.squad = AG.session.squad;
    st.troops = this.troops;
    st.wave = this.wave;
    st.wallHP = Math.round(this.wallHP);
    st.wallMax = this.wallMax;
    st.phase = this.phase;
    st.timer = Math.ceil(this.waveTimer);
    st.guardHP = this.playerHP;
    st.projectiles = this.enemyShots.length;
    st.gate = null;
    st.enemies = this.enem.length;
    st.garrison = 0;
    for (var i = 0; i < this.slots.length; i++) if (this.slots[i].role) st.garrison++;
  };

  AG.BaseScene = BaseScene;
})();
