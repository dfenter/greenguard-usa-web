/* Runeline Depths - play scene.
 * Board, party, enemy, and the authored turn sequence. The scene reads sim
 * edges out of the plan returned by RD.endDrag and never writes sim state.
 * All sprites are allocated once in create and recycled for the whole run.
 */
(function (root) {
  'use strict';

  var RD = root.RD || {}; root.RD = RD;
  var Art = RD.Art;
  var T = RD.TUNE, W = T.W, H = T.H, CELLS = W * H;

  var POP = 0.26, FALL = 0.24, STRIKE = 0.55, ENEMY = 0.78, CLEART = 1.05;

  RD.PlayScene = {
    key: 'play',

    create: function (data) {
      var scene = this;
      var kit = RD.kit;
      var profile = RD.profile;
      data = data || {};
      scene.cameras.main.setZoom(RD.dpr).centerOn(RD.DESIGN_W / 2, RD.DESIGN_H / 2);

      var run, dungeon = null, descent = null;
      if (data.mode === 'descent') {
        descent = RD.buildDescent(RD.todayKey());
        run = RD.createRun({ profile: profile, descent: descent, seed: descent.seed });
      } else {
        dungeon = RD.dungeon(data.dungeonId || 1);
        run = RD.createRun({ profile: profile, dungeon: dungeon });
      }
      RD.run = run;

      var depthId = dungeon ? dungeon.depth : (descent.depths[0] || 'core');
      var L = { w: 390, h: 844, cell: 58, bx: 10, by: 300, top: 0, bottom: 0 };
      var phase = 'enter', pt = 0;
      var plan = null, beatIx = 0;
      var comboShown = 0, comboFade = 0;
      var pendingClear = false;
      var skillArmed = -1, skillArmTimer = 0;
      var tutorialStep = profile.tutorial | 0;
      var cursor = 14, keyHeld = false;
      var dragPointerId = null;
      var shakeCam = scene.cameras.main;

      /* ---------------------------------------------------------- view */
      var sky = scene.add.image(0, 0, 'sky-' + depthId).setOrigin(0, 0).setDepth(-20);
      var vig = scene.add.image(0, 0, 'px-vignette').setOrigin(0, 0).setDepth(-19).setAlpha(0.75);
      var motes = [];
      for (var mi = 0; mi < 12; mi++) {
        var m = scene.add.image(0, 0, 'mote-' + depthId).setDepth(-18).setAlpha(0.35);
        m.__d = { x: Math.random(), y: Math.random(), vy: -8 - Math.random() * 14, ph: Math.random() * 6.28, sp: 0.4 + Math.random() * 0.8 };
        motes.push(m);
      }

      var frame = scene.add.image(0, 0, 'px-white').setOrigin(0, 0).setDepth(4).setAlpha(0);
      var cellImg = [], bindImg = [], cellOff = [];
      for (var ci = 0; ci < CELLS; ci++) {
        cellImg.push(scene.add.image(0, 0, 'orb-' + depthId + '-ember').setDepth(10));
        bindImg.push(scene.add.image(0, 0, 'orb-bind').setDepth(11).setVisible(false));
        cellOff.push({ x: 0, y: 0, s: 1, dying: 0 });
      }
      var held = scene.add.image(-500, -500, 'orb-' + depthId + '-ember').setDepth(30).setVisible(false);
      var timerRing = new RD.Ring(scene, -500, -500, 34, 6, 0x76D8E2, 36).setDepth(29);
      var focusRing = scene.add.image(-500, -500, 'px-ring').setDepth(12).setVisible(false).setAlpha(0.8);
      var invalidMark = scene.add.image(-500, -500, 'icon-clock').setDepth(31).setVisible(false).setTint(0xF7C948);

      /* foe */
      var foeImg = scene.add.image(0, 0, 'px-white').setDepth(6).setVisible(false);
      var foeGlow = scene.add.image(0, 0, 'px-spark').setDepth(5).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
      var foeName = RD.text(scene, 0, 0, '', 17, '#F5F2E9', 750).setOrigin(0.5).setDepth(8);
      var foeHp = new RD.Bar(scene, 0, 0, 200, 12, 0x1B2740, 0xF25C68);
      foeHp.setDepth(8);
      var foeHpText = RD.text(scene, 0, 0, '', 13, '#DCE6F5', 700).setOrigin(0.5).setDepth(9);
      var foeShieldBar = new RD.Bar(scene, 0, 0, 200, 5, 0x1B2740, 0xAFE6EA);
      foeShieldBar.setDepth(8);
      var chargeRing = new RD.Ring(scene, 0, 0, 19, 5, 0xF7C948, 26).setDepth(9);
      var chargeIcon = scene.add.image(0, 0, 'icon-sword').setDisplaySize(17, 17).setDepth(10).setTint(0xF7C948);
      var chargeText = RD.text(scene, 0, 0, '', 15, '#FFE6A6', 800).setOrigin(0.5).setDepth(10);
      var statusIcons = [];
      for (var si = 0; si < 4; si++) {
        var so = {
          bg: scene.add.image(0, 0, 'ui-chip').setDepth(8).setVisible(false).setDisplaySize(52, 24),
          ic: scene.add.image(0, 0, 'icon-shield').setDepth(9).setVisible(false).setDisplaySize(14, 14),
          tx: RD.text(scene, 0, 0, '', 12, '#E8EEF7', 750).setOrigin(0, 0.5).setDepth(9).setVisible(false)
        };
        statusIcons.push(so);
      }

      /* party */
      var slots = [];
      for (var pi = 0; pi < T.party; pi++) {
        var s = {
          plate: scene.add.image(0, 0, 'ui-slot').setDepth(6),
          port: scene.add.image(0, 0, 'guard-trail-ember').setDepth(7),
          hp: new RD.Bar(scene, 0, 0, 54, 6, 0x1B2740, 0x5BCB77),
          ring: new RD.Ring(scene, 0, 0, 15, 4, 0xF7C948, 22),
          badge: scene.add.image(0, 0, 'icon-check').setDepth(9).setDisplaySize(14, 14).setVisible(false),
          lean: 0, hurt: 0
        };
        s.hp.setDepth(8); s.ring.setDepth(9);
        slots.push(s);
      }

      /* HUD */
      var hudTitle = RD.text(scene, 0, 0, '', 15, '#F2F6FF', 750).setDepth(20);
      var hudSub = RD.text(scene, 0, 0, '', 12, '#93A4C2', 600).setDepth(20);
      var pips = [];
      for (var qi = 0; qi < 8; qi++) pips.push(scene.add.image(0, 0, 'px-dot').setDepth(20).setVisible(false));
      var pauseBtn = null;

      var comboBg = scene.add.image(0, 0, 'ui-chip').setDepth(40).setVisible(false).setDisplaySize(84, 32);
      var comboIcon = scene.add.image(0, 0, 'icon-combo').setDepth(41).setVisible(false).setDisplaySize(16, 16).setTint(0xF7C948);
      var comboText = RD.text(scene, 0, 0, '', 17, '#FFE6A6', 800).setOrigin(0, 0.5).setDepth(41).setVisible(false);

      var hurtFlash = scene.add.image(0, 0, 'px-white').setOrigin(0, 0).setDepth(120).setTint(0xF25C68).setAlpha(0);

      var fx = RD.createFX(scene, kit);
      var notices = new RD.Notices(scene, kit);
      var coach = new RD.Coach(scene);

      /* --------------------------------------------------------- panels */
      var panel = new RD.Panel(scene, 210);
      var panelTitle = RD.text(scene, 0, 0, '', 24, '#FFF3D6', 800).setOrigin(0.5).setDepth(212).setVisible(false);
      var panelBody = RD.text(scene, 0, 0, '', 15, '#C6D3E6', 600, 'center').setOrigin(0.5).setDepth(212).setVisible(false);
      panel.items.push(panelTitle, panelBody);
      var panelBtns = [];

      function clearPanelButtons() {
        panelBtns.forEach(function (b) { b.destroy(); });
        panelBtns.length = 0;
      }
      function showPanel(title, body, buttons) {
        clearPanelButtons();
        notices.clear();
        coach.hide();
        RD.setText(panelTitle, title);
        RD.setText(panelBody, body || '');
        panelTitle.setPosition(L.w / 2, L.h * 0.30).setVisible(true);
        panelBody.setPosition(L.w / 2, L.h * 0.30 + 42).setVisible(true);
        panelBody.setWordWrapWidth(Math.min(320, L.w - 60));
        panel.show();
        var y = L.h * 0.30 + 66 + Math.max(28, panelBody.height) + 28;
        buttons.forEach(function (b, i) {
          var btn = new RD.Button(scene, L.w / 2, y + i * 62, Math.min(260, L.w - 72), 50, b.label, {
            bright: i === 0, tint: i === 0 ? 0x3E7C63 : 0x2A3A5C, icon: b.icon,
            onUp: function () { kit.audio.sfx('ui_click'); b.fn(); }
          });
          btn.setDepth(213);
          panelBtns.push(btn);
        });
      }
      function hidePanel() {
        clearPanelButtons();
        panel.hide();
        RD.setVis(panelTitle, false);
        RD.setVis(panelBody, false);
      }

      /* ---------------------------------------------------------- layout */
      /* Keep the logical layout dimensions stable so a repeated scale event
         cannot re-bake the board frame every frame. */
      var laidOut = false;
      function layout() {
        var ins = RD.insets();
        var vw = Math.round(RD.viewW(scene)), vh = Math.round(RD.viewH(scene));
        if (laidOut && vw === L.w && vh === L.h && ins.top === L.top && ins.bottom === L.bottom) return;
        laidOut = true;
        L.w = vw; L.h = vh;
        L.top = ins.top; L.bottom = ins.bottom;

        sky.setDisplaySize(L.w, L.h);
        vig.setDisplaySize(L.w, L.h);
        hurtFlash.setDisplaySize(L.w, L.h);
        panel.layout(L);

        var pad = 9;
        var hudH = 44;
        var partyH = 78;
        var avail = L.h - L.top - L.bottom - hudH - partyH - 18;
        var cellW = Math.floor((L.w - 20 - pad * 2) / W);
        var cellH = Math.floor((avail - 168) / H);
        L.cell = Math.max(30, Math.min(cellW, cellH, 68));
        var bw = W * L.cell + pad * 2, bh = H * L.cell + pad * 2;
        L.bx = Math.round((L.w - bw) / 2) + pad;
        var partyTop = L.h - L.bottom - partyH;
        L.by = Math.round(partyTop - 14 - bh) + pad;
        L.pad = pad;
        L.chipY = L.top + hudH + 26;
        L.coachY = L.top + hudH;

        var key = 'board-' + depthId + '-' + L.cell;
        if (!scene.textures.exists(key)) Art.put(scene, key, Art.bakeBoard(depthId, L.cell, W, H, pad));
        frame.setTexture(key).setPosition(L.bx - pad, L.by - pad).setAlpha(1).setDisplaySize(bw, bh);

        for (var i = 0; i < CELLS; i++) {
          cellImg[i].setDisplaySize(L.cell * 0.98, L.cell * 0.98);
          bindImg[i].setDisplaySize(L.cell * 0.98, L.cell * 0.98);
        }
        held.setDisplaySize(L.cell * 1.10, L.cell * 1.10);
        focusRing.setDisplaySize(L.cell * 0.98, L.cell * 0.98);
        timerRing.move(-500, -500, L.cell * 0.72);

        /* foe zone */
        var foeTop = L.top + hudH + 6;
        var foeSpace = (L.by - L.pad) - foeTop;
        L.foeSize = Math.max(96, Math.min(224, foeSpace - 72));
        L.foeCx = L.w / 2;
        /* One combat row: combo chip, health bar, charge ring. Status chips
           sit on the row above, the name above those. Nothing overlaps. */
        var barY = foeTop + foeSpace - 26;
        var ringX = L.w - 34;
        var barX = 100;
        var barW = Math.max(80, ringX - 26 - barX);
        L.foeCy = foeTop + Math.max(L.foeSize / 2 + 4, (barY - 62 - foeTop) / 2 + 6);
        foeName.setPosition(L.foeCx, barY - 54);
        foeHp.move(barX, barY, barW);
        foeHpText.setPosition(barX + barW / 2, barY);
        foeShieldBar.move(barX, barY + 11, barW);
        chargeRing.move(ringX, barY, 17);
        chargeIcon.setPosition(ringX, barY);
        chargeText.setPosition(ringX, barY);
        L.comboX = 12; L.comboY = barY;
        for (var k = 0; k < statusIcons.length; k++) {
          var sx = 12 + k * 58, sy = barY - 28;
          statusIcons[k].bg.setPosition(sx, sy).setOrigin(0, 0.5);
          statusIcons[k].ic.setPosition(sx + 13, sy);
          statusIcons[k].tx.setPosition(sx + 26, sy);
        }

        /* party row */
        var gap = 6;
        var sw = Math.floor((L.w - 20 - gap * (T.party - 1)) / T.party);
        var sh = Math.min(70, partyH - 6);
        L.slotW = sw; L.slotH = sh; L.partyTop = partyTop;
        for (var p = 0; p < T.party; p++) {
          var x = 10 + p * (sw + gap) + sw / 2;
          var y = partyTop + sh / 2;
          slots[p].x = x; slots[p].y = y;
          slots[p].plate.setPosition(x, y).setDisplaySize(sw, sh);
          slots[p].port.setPosition(x, y - 6).setDisplaySize(sh * 0.62, sh * 0.62);
          slots[p].hp.move(x - sw / 2 + 6, y + sh / 2 - 9, sw - 12);
          slots[p].ring.move(x + sw / 2 - 15, y - sh / 2 + 15, 12);
          slots[p].badge.setPosition(x + sw / 2 - 15, y - sh / 2 + 15);
          slots[p].plate.setInteractive(new Phaser.Geom.Rectangle(0, 0, Math.max(44, sw), Math.max(44, sh)), Phaser.Geom.Rectangle.Contains);
        }

        /* hud */
        hudTitle.setPosition(12, L.top + 8);
        hudSub.setPosition(12, L.top + 27);
        for (var pp = 0; pp < pips.length; pp++) pips[pp].setPosition(L.w - 118 + pp * 12, L.top + 30);
        if (pauseBtn) pauseBtn.destroy();
        pauseBtn = new RD.Button(scene, L.w - 32, L.top + 24, 44, 44, '', { tint: 0x1B2743, onUp: openPause });
        pauseBtn.setDepth(20);
        pauseBtn.label.setVisible(false);
        if (!pauseBtn.icon) {
          pauseBtn.icon = scene.add.image(L.w - 32, L.top + 24, 'icon-pause').setDisplaySize(18, 18).setDepth(21).setAlpha(0.9);
          pauseBtn.parts.push(pauseBtn.icon);
        }

        comboBg.setPosition(L.comboX, L.comboY).setOrigin(0, 0.5).setDisplaySize(80, 28);
        comboIcon.setPosition(L.comboX + 15, L.comboY);
        comboText.setPosition(L.comboX + 31, L.comboY);

        notices.layout(L);
        coach.layout(L);

        for (var mm = 0; mm < motes.length; mm++) {
          motes[mm].setDisplaySize(20 + (mm % 3) * 9, 20 + (mm % 3) * 9);
        }
        if (panel.open) {
          panelTitle.setPosition(L.w / 2, L.h * 0.30);
          panelBody.setPosition(L.w / 2, L.h * 0.30 + 42);
        }
        redrawBoard();
      }

      /* ------------------------------------------------------ geometry */
      function cx(c) { return L.bx + c * L.cell + L.cell / 2; }
      function cy(r) { return L.by + r * L.cell + L.cell / 2; }
      function cellAt(x, y) {
        var c = Math.floor((x - L.bx) / L.cell), r = Math.floor((y - L.by) / L.cell);
        if (r < 0 || r >= H || c < 0 || c >= W) return -1;
        return RD.idx(r, c);
      }

      function orbKey(color, lifted) {
        return 'orb-' + depthId + '-' + color + (lifted ? '-l' : '');
      }

      function redrawBoard() {
        for (var i = 0; i < CELLS; i++) {
          var col = run.board[i];
          var img = cellImg[i];
          img.setTexture(orbKey(col, false));
          img.setPosition(cx(RD.colOf(i)), cy(RD.rowOf(i)));
          img.setVisible(true).setAlpha(1);
          img.setDisplaySize(L.cell * 0.98, L.cell * 0.98);
          cellOff[i].x = 0; cellOff[i].y = 0; cellOff[i].s = 1; cellOff[i].dying = 0;
          var bound = !!run.binds[col];
          RD.setVis(bindImg[i], bound);
          if (bound) {
            bindImg[i].setPosition(cx(RD.colOf(i)), cy(RD.rowOf(i)));
            bindImg[i].setDisplaySize(L.cell * 0.98, L.cell * 0.98);
          }
        }
        if (run.mode === 'drag' && run.held >= 0) cellImg[run.held].setVisible(false);
      }

      /* --------------------------------------------------------- rooms */
      function beginRoom(result) {
        var room = run.roomList[run.roomIndex];
        if (descent && descent.depths && descent.depths[run.roomIndex]) {
          var nd = descent.depths[run.roomIndex];
          if (nd !== depthId) { depthId = nd; reskin(); }
        }
        var key = RD.foeTexture(scene, run.foe.id);
        foeImg.setTexture(key).setVisible(true);
        foeImg.setDisplaySize(L.foeSize, L.foeSize);
        foeImg.setPosition(L.foeCx, L.foeCy).setAlpha(1).setScale(foeImg.scaleX);
        foeGlow.setPosition(L.foeCx, L.foeCy).setDisplaySize(L.foeSize * 1.4, L.foeSize * 1.4).setAlpha(0);
        RD.setText(foeName, run.foe.name);
        RD.setTint(foeHp.fill, run.foe.isBoss ? 0xF25C68 : 0xE07A6A);
        redrawBoard();
        updateFoeHud();
        updatePartyHud();

        if (result && result.events) {
          for (var i = 0; i < result.events.length; i++) {
            var e = result.events[i];
            if (e.t === 'preempt') {
              notices.chip('Preemptive strike', 'skull', 0xF25C68);
              kit.audio.sfx('enemy_hit');
              hurtFlash.setAlpha(0.4);
              kit.juice.shake(7, 180);
              if (e.wipe) { queueWipe(); return; }
            } else if (e.t === 'bind') {
              notices.chip(RD.orb(e.color).label + ' bound', 'lock', RD.orb(e.color).color);
              kit.audio.sfx('bind');
            }
          }
        }
        if (run.foe.isBoss) {
          notices.banner(run.foe.name, 'Boss of ' + (dungeon ? dungeon.name : 'the Descent'), 0xF25C68, 1.5);
          RD.music('music_deep');
        }
        phase = 'idle'; pt = 0;
        RD.readyTurn(run);
        run.mode = 'idle';
        teachStep();
      }

      function reskin() {
        sky.setTexture('sky-' + depthId);
        for (var i = 0; i < motes.length; i++) motes[i].setTexture('mote-' + depthId);
        var key = 'board-' + depthId + '-' + L.cell;
        if (!scene.textures.exists(key)) Art.put(scene, key, Art.bakeBoard(depthId, L.cell, W, H, L.pad));
        frame.setTexture(key);
        held.setTexture(orbKey(run.board[Math.max(0, run.held)] || 'ember', true));
      }

      /* ------------------------------------------------------- HUD sync */
      function updateFoeHud() {
        var f = run.foe;
        if (!f) return;
        foeHp.set(f.hp / f.maxHp);
        RD.setText(foeHpText, Math.ceil(f.hp) + ' / ' + f.maxHp);
        var hasShield = f.shieldMax > 0;
        RD.setVis(foeShieldBar.track, hasShield);
        RD.setVis(foeShieldBar.fill, hasShield && f.shield > 0);
        if (hasShield) foeShieldBar.set(f.shield / f.shieldMax);
        chargeRing.set(1 - (f.charge - 1) / Math.max(1, f.chargeMax));
        chargeRing.setColor(f.charge <= 1 ? 0xF25C68 : 0xF7C948);
        RD.setText(chargeText, String(f.charge));
        RD.setColor(chargeText, f.charge <= 1 ? '#FFC2B6' : '#FFE6A6');
        RD.setVis(chargeText, true);
        RD.setVis(chargeIcon, false);

        var n = 0;
        function status(icon, label, tint) {
          if (n >= statusIcons.length) return;
          var s = statusIcons[n++];
          s.bg.setVisible(true);
          s.ic.setVisible(true).setTexture('icon-' + icon);
          RD.setTint(s.ic, tint);
          s.tx.setVisible(true);
          RD.setText(s.tx, label);
          s.bg.setDisplaySize(30 + label.length * 8, 24);
        }
        if (f.shield > 0) status('shield', 'x' + f.shieldCombo, 0xAFE6EA);
        if (f.armour > 0 && f.armourSuppressed <= 0) status('lock', Math.round(f.armour * 100) + '%', 0xC9A16A);
        for (var b in run.binds) status('lock', String(run.binds[b]), RD.orb(b).color);
        if (f.enraged) status('sword', '!', 0xF25C68);
        for (var q = n; q < statusIcons.length; q++) {
          RD.setVis(statusIcons[q].bg, false);
          RD.setVis(statusIcons[q].ic, false);
          RD.setVis(statusIcons[q].tx, false);
        }
      }

      function updatePartyHud() {
        for (var i = 0; i < T.party; i++) {
          var m = run.party[i], s = slots[i];
          var evo = m.evolved && scene.textures.exists('guard-' + m.id + '-e');
          s.port.setTexture('guard-' + m.id + (evo ? '-e' : ''));
          s.hp.set(m.hp / m.maxHp);
          var frac = m.hp / m.maxHp;
          s.hp.setColors(0x1B2740, m.hp <= 0 ? 0x55607A : frac < 0.3 ? 0xF25C68 : frac < 0.6 ? 0xF7C948 : 0x5BCB77);
          s.port.setAlpha(m.hp <= 0 ? 0.35 : 1);
          var ready = RD.skillReady(m);
          RD.setVis(s.badge, ready);
          if (ready) { s.ring.set(1); s.ring.setColor(skillArmed === i ? 0x76D8E2 : 0x5BCB77); }
          else if (m.skill) { s.ring.set(1 - m.cd / Math.max(1, m.skill.cd)); s.ring.setColor(0x46608C); }
          else s.ring.clear();
          RD.setTint(s.plate, i === 0 ? 0xFFF0C4 : 0xFFFFFF);
        }
      }

      function updateHudTop() {
        var name = dungeon ? dungeon.name : 'Daily Descent';
        var dep = RD.depth(depthId);
        RD.setText(hudTitle, name);
        RD.setText(hudSub, dep.name + (descent ? '  ' + descent.mod.name : ''));
        var total = run.roomList.length;
        for (var i = 0; i < pips.length; i++) {
          var on = i < total;
          RD.setVis(pips[i], on);
          if (!on) continue;
          pips[i].setDisplaySize(i === run.roomIndex ? 9 : 6, i === run.roomIndex ? 9 : 6);
          RD.setTint(pips[i], i < run.roomIndex ? 0x5BCB77 : i === run.roomIndex ? 0xF7C948 : 0x46608C);
          pips[i].setAlpha(i <= run.roomIndex ? 1 : 0.55);
        }
      }

      /* -------------------------------------------------------- tutorial */
      function teachStep() {
        if (tutorialStep >= RD.TUTORIAL.length) return;
        if (!dungeon || dungeon.id !== 1) return;
        coach.say(RD.TUTORIAL[tutorialStep].text, 4.6);
      }
      function teachAdvance(afterId) {
        if (!dungeon || dungeon.id !== 1) return;
        if (tutorialStep !== afterId) return;
        tutorialStep++;
        profile.tutorial = tutorialStep;
        RD.saveProfile();
        if (tutorialStep < RD.TUTORIAL.length) coach.say(RD.TUTORIAL[tutorialStep].text, 4.6);
        else coach.hide();
      }

      /* ---------------------------------------------------------- input */
      function claim(pointer) {
        /* GGKit owns pointer identity. A canvas level pointerdown can fire
           before the kit's window listener, so seed the entry at claim time. */
        var ev = pointer && pointer.event;
        var id = ev && ev.pointerId != null ? ev.pointerId : pointer.id;
        if (!kit.input.pointers.has(id)) {
          kit.input.pointers.set(id, {
            x: pointer.x, y: pointer.y, startX: pointer.x, startY: pointer.y,
            downAt: performance.now(), zone: 'board'
          });
        }
        return id;
      }

      function canAct() {
        return phase === 'idle' && !panel.open && !kit.paused && run.mode !== 'over';
      }

      function pickUp(i, fromKey) {
        if (!canAct() || i < 0) return;
        if (!RD.beginDrag(run, i)) return;
        keyHeld = !!fromKey;
        cursor = i;
        cellImg[i].setVisible(false);
        held.setTexture(orbKey(run.board[i], true)).setVisible(true);
        held.setPosition(cx(RD.colOf(i)), cy(RD.rowOf(i)));
        held.setDisplaySize(L.cell * 1.10, L.cell * 1.10);
        kit.audio.sfx('orb_pick');
        teachAdvance(0);
      }

      function stepTo(i) {
        if (run.mode !== 'drag' || i < 0) return;
        var from = run.held;
        if (i === from) return;
        var r0 = RD.rowOf(from), c0 = RD.colOf(from), r1 = RD.rowOf(i), c1 = RD.colOf(i);
        var guard = 0;
        /* walk one orthogonal step at a time so a fast flick cannot skip */
        while ((r0 !== r1 || c0 !== c1) && guard++ < 12) {
          if (c0 !== c1) c0 += c1 > c0 ? 1 : -1;
          else r0 += r1 > r0 ? 1 : -1;
          var nx = RD.idx(r0, c0);
          var prev = run.held;
          if (!RD.dragTo(run, nx)) break;
          var pxr = RD.rowOf(prev), pxc = RD.colOf(prev);
          cellImg[prev].setTexture(orbKey(run.board[prev], false)).setVisible(true);
          cellImg[prev].setPosition(cx(pxc), cy(pxr));
          cellOff[prev].x = cx(c0) - cx(pxc);
          cellOff[prev].y = cy(r0) - cy(pxr);
          cellImg[nx].setVisible(false);
          fx.trailDot(cx(pxc), cy(pxr), RD.depth(depthId).accent, L.cell / 46);
          kit.audio.sfx('orb_move', { rate: 0.9 + Math.min(0.6, run.path.length * 0.03) });
        }
      }

      function release() {
        if (run.mode !== 'drag') return;
        var res = RD.endDrag(run);
        held.setVisible(false);
        timerRing.clear();
        keyHeld = false;
        if (!res) return;
        if (res.empty) {
          redrawBoard();
          kit.audio.sfx('invalid');
          notices.chip('Move an orb first', 'clock', 0xF7C948);
          run.mode = 'idle';
          return;
        }
        teachAdvance(1);
        startPlan(res);
      }

      scene.input.on('pointerdown', function (pointer) {
        if (panel.open || kit.paused) return;
        var id = claim(pointer);
        if (phase !== 'idle') return;
        var i = cellAt(pointer.x, pointer.y);
        if (i < 0) return;
        dragPointerId = id;
        pickUp(i, false);
      });
      scene.input.on('pointermove', function (pointer) {
        if (run.mode !== 'drag' || keyHeld) return;
        var ev = pointer.event;
        var id = ev && ev.pointerId != null ? ev.pointerId : pointer.id;
        if (id !== dragPointerId) return;
        held.setPosition(pointer.x, pointer.y - L.cell * 0.28);
        var i = cellAt(pointer.x, pointer.y - L.cell * 0.28);
        if (i >= 0) stepTo(i);
      });
      function endPointer(pointer) {
        var ev = pointer && pointer.event;
        var id = ev && ev.pointerId != null ? ev.pointerId : (pointer ? pointer.id : null);
        if (id !== dragPointerId) return;
        dragPointerId = null;
        if (!keyHeld) release();
      }
      scene.input.on('pointerup', endPointer);
      scene.input.on('pointerupoutside', endPointer);
      scene.input.on('gameout', function () { if (run.mode === 'drag' && !keyHeld) release(); });

      for (var sp = 0; sp < T.party; sp++) {
        (function (n) {
          slots[n].plate.on('pointerdown', function () {
            if (!canAct()) return;
            armSkill(n);
          });
        })(sp);
      }

      function armSkill(n) {
        var m = run.party[n];
        if (!m || !m.skill) return;
        if (!RD.skillReady(m)) {
          notices.chip(m.skill.name + ' in ' + m.cd, 'clock', 0x93A4C2);
          kit.audio.sfx('invalid');
          return;
        }
        if (skillArmed === n) {
          var out = RD.useSkill(run, n);
          skillArmed = -1;
          if (!out) return;
          kit.audio.sfx(out.foeHit ? 'strike' : out.id === 'dew-veil' || out.id === 'green-echo-a' ? 'heal' : 'combo');
          notices.chip(out.name, 'sword', 0x76D8E2);
          if (out.cells) {
            for (var i = 0; i < out.cells.length; i++) {
              var ix = out.cells[i];
              fx.sparks(cx(RD.colOf(ix)), cy(RD.rowOf(ix)), RD.depth(depthId).accent, 5);
            }
            redrawBoard();
          }
          if (out.amount > 0) {
            if (out.foeHit) {
              fx.sparks(L.foeCx, L.foeCy, 0xFFE6A6, 14);
              fx.float(L.foeCx, L.foeCy - 20, String(out.amount), '#FFF0A6', 26);
              kit.juice.shake(6, 160);
            } else {
              fx.float(L.w / 2, L.partyTop - 12, '+' + out.amount, '#8FE3A6', 22);
            }
          }
          teachAdvance(5);
          updateFoeHud(); updatePartyHud();
          if (out.foeDown) { pendingClear = true; phase = 'clear'; pt = 0; onRoomCleared(); }
          return;
        }
        skillArmed = n;
        skillArmTimer = 3.2;
        notices.chip(m.skill.name, 'check', 0x76D8E2);
        coach.say(m.skill.text + ' Tap again to use.', 3.2);
        kit.audio.sfx('ui_click');
      }

      /* keyboard, fully wired beside touch */
      var keys = scene.input.keyboard.addKeys(
        'UP,DOWN,LEFT,RIGHT,W,A,S,D,SPACE,ENTER,ESC,P,ONE,TWO,THREE,FOUR,FIVE,R');
      function keyStep(dr, dc) {
        var r = Math.max(0, Math.min(H - 1, RD.rowOf(cursor) + dr));
        var c = Math.max(0, Math.min(W - 1, RD.colOf(cursor) + dc));
        var i = RD.idx(r, c);
        if (i === cursor) return;
        if (run.mode === 'drag') { stepTo(i); cursor = run.held; }
        else cursor = i;
      }
      scene.input.keyboard.on('keydown', function (e) {
        if (kit.paused && e.code !== 'Escape' && e.code !== 'KeyP') return;
        switch (e.code) {
          case 'ArrowUp': case 'KeyW': keyStep(-1, 0); e.preventDefault(); break;
          case 'ArrowDown': case 'KeyS': keyStep(1, 0); e.preventDefault(); break;
          case 'ArrowLeft': case 'KeyA': keyStep(0, -1); e.preventDefault(); break;
          case 'ArrowRight': case 'KeyD': keyStep(0, 1); e.preventDefault(); break;
          case 'Space': case 'Enter':
            e.preventDefault();
            if (panel.open) break;
            if (run.mode === 'drag') release();
            else pickUp(cursor, true);
            break;
          case 'Escape': case 'KeyP':
            e.preventDefault();
            if (panel.open) { if (panelKind === 'pause') closePause(); }
            else openPause();
            break;
          case 'Digit1': armSkill(0); break;
          case 'Digit2': armSkill(1); break;
          case 'Digit3': armSkill(2); break;
          case 'Digit4': armSkill(3); break;
          case 'Digit5': armSkill(4); break;
          default: break;
        }
      });

      /* ------------------------------------------------------ turn flow */
      /* Render an explicit board snapshot. The sim hands the view a
         boardBefore plus one snapshot per cascade beat, so the view never
         has to guess an intermediate state. */
      function renderBoard(board) {
        for (var i = 0; i < CELLS; i++) {
          cellImg[i].setTexture(orbKey(board[i], false)).setVisible(true).setAlpha(1);
          cellImg[i].setPosition(cx(RD.colOf(i)), cy(RD.rowOf(i)));
          cellImg[i].setDisplaySize(L.cell * 0.98, L.cell * 0.98);
          cellOff[i].x = 0; cellOff[i].y = 0; cellOff[i].s = 1; cellOff[i].dying = 0;
          var bound = !!run.binds[board[i]];
          RD.setVis(bindImg[i], bound);
          if (bound) bindImg[i].setPosition(cx(RD.colOf(i)), cy(RD.rowOf(i))).setDisplaySize(L.cell * 0.98, L.cell * 0.98);
        }
      }

      function startPlan(p) {
        plan = p;
        beatIx = 0;
        comboShown = 0;
        renderBoard(p.boardBefore || run.board);
        if (!p.beats.length) {
          kit.audio.sfx('invalid');
          notices.chip('No line formed', 'clock', 0xF7C948);
          /* the sim already resolved the enemy action for this turn */
          phase = 'enemyWait'; pt = 0;
          return;
        }
        phase = 'pop'; pt = 0;
        startBeat();
      }

      function startBeat() {
        var b = plan.beats[beatIx];
        var dep = RD.depth(depthId);
        for (var g = 0; g < b.groups.length; g++) {
          var grp = b.groups[g];
          var col = RD.orb(grp.color).color;
          for (var q = 0; q < grp.cells.length; q++) {
            var i = grp.cells[q];
            cellOff[i].dying = 1;
            fx.fragments(cx(RD.colOf(i)), cy(RD.rowOf(i)), col, beatIx === 0 ? 5 : 4);
          }
          /* one directional streak per group so a cascade reads as a line */
          var a = grp.cells[0], z = grp.cells[grp.cells.length - 1];
          fx.streakTo(cx(RD.colOf(a)), cy(RD.rowOf(a)), cx(RD.colOf(z)), cy(RD.rowOf(z)), col, L.cell * 0.4);
        }
        comboShown = b.comboAfter;
        comboFade = 1.6;
        RD.setText(comboText, 'x' + comboShown);
        RD.setVis(comboBg, true); RD.setVis(comboIcon, true); RD.setVis(comboText, true);
        if (beatIx === 0) kit.audio.sfx('match');
        else kit.audio.sfx('cascade', { rate: Math.min(1.9, 1 + beatIx * 0.16) });
        if (b.comboAfter >= 4 && beatIx === 0) kit.audio.sfx('combo');
        if (beatIx === 0) kit.juice.hitStop(40);
        else if (b.comboAfter >= 4) kit.juice.hitStop(45);
        if (b.comboAfter >= 3) kit.juice.shake(Math.min(9, 2 + b.comboAfter * 0.8), 160);
        teachAdvance(2);
        if (b.groups.some(function (x) { return x.color === 'heart'; })) teachAdvance(3);
      }

      function applyBeatBoard() {
        var b = plan.beats[beatIx];
        var board = b.board;
        for (var i = 0; i < CELLS; i++) {
          cellImg[i].setTexture(orbKey(board[i], false)).setVisible(true).setAlpha(1);
          cellImg[i].setPosition(cx(RD.colOf(i)), cy(RD.rowOf(i)));
          cellOff[i].x = 0; cellOff[i].y = 0; cellOff[i].s = 1; cellOff[i].dying = 0;
          var bound = !!run.binds[board[i]];
          RD.setVis(bindImg[i], bound);
          if (bound) bindImg[i].setPosition(cx(RD.colOf(i)), cy(RD.rowOf(i))).setDisplaySize(L.cell * 0.98, L.cell * 0.98);
        }
        for (var f = 0; f < b.falls.length; f++) {
          var fl = b.falls[f];
          var ix = RD.idx(fl.to, fl.col);
          cellOff[ix].y = -(fl.to - fl.from) * L.cell;
        }
        for (var s = 0; s < b.spawns.length; s++) {
          var sp2 = b.spawns[s];
          var jx = RD.idx(sp2.row, sp2.col);
          cellOff[jx].y = -(sp2.row + 1.2) * L.cell;
        }
      }

      function doStrike() {
        var dep = RD.depth(depthId);
        var anyColor = plan.colors.length ? RD.orb(plan.colors[0]).color : dep.accent;
        for (var i = 0; i < T.party; i++) {
          var m = run.party[i];
          if (m.hp <= 0) continue;
          if (plan.colorOrbs[m.el] || plan.damage > 0) {
            slots[i].lean = 1;
            fx.streakTo(slots[i].x, slots[i].y - 10, L.foeCx, L.foeCy + 20, RD.orb(m.el).color, 10);
          }
        }
        if (plan.damage > 0) {
          kit.audio.sfx('strike');
          fx.sparks(L.foeCx, L.foeCy, anyColor, plan.effCombo >= 4 ? 16 : 10);
          fx.float(L.foeCx, L.foeCy - L.foeSize * 0.28, String(plan.dealt + plan.toShield), '#FFF0A6', plan.effCombo >= 5 ? 30 : 25);
          foeGlow.setAlpha(0.55).setTint(anyColor);
          kit.juice.shake(Math.min(11, 3 + plan.effCombo * 1.1), 190);
          kit.juice.hitStop(plan.effCombo >= 4 ? 70 : 45);
        }
        if (plan.shieldBroke) {
          kit.audio.sfx('shield_break');
          fx.celebrate(L.foeCx, L.foeCy, [0xAFE6EA, 0xF7FBFF, 0x76D8E2], 16);
          notices.chip('Shield shattered', 'shield', 0xAFE6EA);
        }
        if (plan.healed > 0) {
          kit.audio.sfx('heal');
          fx.float(L.w / 2, L.partyTop - 10, '+' + plan.healed, '#8FE3A6', 22);
          for (var p = 0; p < T.party; p++) if (run.party[p].hp > 0) fx.sparks(slots[p].x, slots[p].y, 0x8FE3A6, 4);
        }
        if (plan.shieldGain > 0) notices.chip('Ward ' + RD.fmt(plan.shieldGain), 'shield', 0x9A7CF3);
        if (plan.boundLoss > 0) notices.chip('Bound line', 'lock', 0x9A7CF3);
        updateFoeHud();
        updatePartyHud();
      }

      function doEnemy() {
        var e = plan && plan.enemy;
        if (!e) return;
        if (e.enraged) { notices.chip('Enraged', 'sword', 0xF25C68); kit.audio.sfx('bind'); }
        if (e.act === 'attack') {
          kit.audio.sfx('enemy_hit');
          foeImg.y = L.foeCy + 14;
          hurtFlash.setAlpha(0.34);
          kit.juice.shake(7, 200);
          for (var i = 0; i < T.party; i++) if (run.party[i].hp > 0) slots[i].hurt = 1;
          fx.float(L.w / 2, L.partyTop - 10, '-' + e.dmg, '#FF9B88', 24);
          fx.sparks(L.w / 2, L.partyTop, 0xF25C68, 10);
          teachAdvance(4);
        } else if (e.act === 'bind') {
          kit.audio.sfx('bind');
          notices.chip(RD.orb(e.color).label + ' bound ' + e.turns, 'lock', RD.orb(e.color).color);
          redrawBoard();
        } else if (e.act === 'timelock') {
          kit.audio.sfx('bind');
          notices.chip('Time cut ' + e.amount + 's', 'clock', 0x9A7CF3);
        } else if (e.act === 'mend') {
          kit.audio.sfx('heal');
          notices.chip('Mended ' + RD.fmt(e.amount), 'heart', 0x5BCB77);
          fx.sparks(L.foeCx, L.foeCy, 0x5BCB77, 10);
        } else if (e.act === 'blocked') {
          kit.audio.sfx('shield_break');
          notices.chip('Attack blocked', 'shield', 0x5BCB77);
        }
        updateFoeHud();
        updatePartyHud();
      }

      /* ------------------------------------------------------- outcomes */
      function onRoomCleared() {
        kit.audio.sfx(run.foe.isBoss ? 'boss_down' : 'room_clear');
        var dep = RD.depth(depthId);
        fx.celebrate(L.foeCx, L.foeCy, [dep.accent, 0xF7C948, 0xF7FBFF, RD.orb(run.foe.el).color], run.foe.isBoss ? 30 : 18);
        foeGlow.setAlpha(0.8).setTint(0xFFF0C4);
        kit.juice.shake(run.foe.isBoss ? 10 : 6, 260);
        pendingClear = true;
        phase = 'clear'; pt = 0;
      }

      function finishDungeon() {
        run.mode = 'over'; run.over = 'clear';
        RD.music('music_hall');
        if (descent) {
          var d = profile.descent;
          var today = RD.todayKey();
          if (d.day !== today) { d.day = today; d.rooms = 0; d.best = 0; d.cleared = false; }
          d.rooms = Math.max(d.rooms, run.roomsCleared);
          d.best = Math.max(d.best, run.roomsCleared);
          d.cleared = true;
          profile.runes += run.runesEarned;
          profile.stats.rooms += run.roomsCleared;
          if (run.bestCombo > profile.stats.bestCombo) profile.stats.bestCombo = run.bestCombo;
          RD.saveProfile();
          notices.banner('Descent complete', 'All six rooms cleared', 0x76D8E2, 1.8);
          showPanel('Descent complete',
            'Rooms cleared ' + run.roomsCleared + '\nBest combo ' + run.bestCombo + '\nRunes ' + run.runesEarned,
            [{ label: 'Return to the surface', icon: 'check', fn: leave }]);
          return;
        }
        var res = RD.grantDungeonClear(profile, dungeon, run);
        RD.saveProfile();
        notices.banner(dungeon.name + ' cleared', RD.depth(depthId).name, 0xF7C948, 1.8);
        if (res.drop) {
          kit.audio.sfx('recruit');
          fx.celebrate(L.w / 2, L.h * 0.45, [0xF7C948, 0xF7FBFF, 0x5BCB77], 26);
        }
        var body = 'Runes earned ' + res.runes + '\nBest combo ' + run.bestCombo;
        if (res.drop) body += '\n' + RD.guard(res.drop).name + ' joined the roster';
        showPanel(res.drop ? 'Runeguard recruited' : 'Depth cleared', body,
          [{ label: 'Back to the map', icon: 'check', fn: leave }]);
      }

      function queueWipe() {
        phase = 'wipe'; pt = 0;
      }

      function onWipe() {
        run.mode = 'over'; run.over = 'wipe';
        kit.audio.sfx('fail');
        RD.music('music_vault');
        notices.banner('The line goes quiet', '', 0xF25C68, 1.4);
        showPanel('The line goes quiet',
          descent ? 'The Descent ends here. Rooms cleared ' + run.roomsCleared + '.'
                  : 'This room only. Retry it with a full party, or abandon the run.',
          descent
            ? [{ label: 'Return to the surface', icon: 'check', fn: endDescent }]
            : [{ label: 'Retry this room', icon: 'play', fn: retry },
               { label: 'Abandon the run', icon: 'back', fn: leave }]);
      }

      function endDescent() {
        var d = profile.descent;
        var today = RD.todayKey();
        if (d.day !== today) { d.day = today; d.rooms = 0; d.best = 0; d.cleared = false; }
        d.rooms = Math.max(d.rooms, run.roomsCleared);
        d.best = Math.max(d.best, run.roomsCleared);
        profile.runes += run.runesEarned;
        profile.stats.rooms += run.roomsCleared;
        RD.saveProfile();
        leave();
      }

      function retry() {
        hidePanel();
        notices.clear();
        fx.clear();
        var r = RD.retryRoom(run);
        skillArmed = -1;
        beginRoom(r);
      }

      function leave() {
        hidePanel();
        RD.run = null;
        scene.scene.start('menu', { screen: dungeon ? 'map' : 'title' });
      }

      /* ---------------------------------------------------------- pause */
      var panelKind = '';
      function openPause() {
        if (panel.open) return;
        panelKind = 'pause';
        kit.pause('menu');
        if (run.mode === 'drag') { RD.cancelDrag(run); held.setVisible(false); timerRing.clear(); redrawBoard(); }
        var lead = run.party[0];
        var lg = RD.guardStats(lead.id, lead.evolved ? 1 : 0);
        showPanel('Paused',
          'Leader ' + lg.name + '\n' + lg.skill,
          [{ label: 'Resume', icon: 'play', fn: closePause },
           { label: 'Settings', icon: 'gear', fn: function () { kit.openSettings(); } },
           { label: dungeon ? 'Abandon the run' : 'Leave the Descent', icon: 'back', fn: leave }]);
      }
      function closePause() {
        if (panelKind !== 'pause') return;
        panelKind = '';
        hidePanel();
        kit.resume('menu');
      }

      /* ---------------------------------------------------------- frame */
      function tick(dt) {
        dt = dt > 0.05 ? 0.05 : dt;
        var j = kit.juice.frame();
        shakeCam.setScroll(j.dx, j.dy);
        if (kit.paused && panelKind !== 'pause') return;

        /* ambient motion runs on the view clock even while a panel is up */
        for (var i = 0; i < motes.length; i++) {
          var m = motes[i], d = m.__d;
          d.y += (d.vy / Math.max(1, L.h)) * dt;
          if (d.y < -0.05) { d.y = 1.05; d.x = Math.random(); }
          d.ph += dt * d.sp;
          m.setPosition(d.x * L.w + Math.sin(d.ph) * 16, d.y * L.h);
          m.setAlpha(0.18 + 0.18 * (0.5 + 0.5 * Math.sin(d.ph * 1.7)));
        }
        fx.update(dt);
        notices.update(dt);
        coach.update(dt);
        if (hurtFlash.alpha > 0) hurtFlash.setAlpha(Math.max(0, hurtFlash.alpha - dt * 1.6));
        if (foeGlow.alpha > 0) foeGlow.setAlpha(Math.max(0, foeGlow.alpha - dt * 1.8));

        if (panel.open || kit.paused) return;
        if (j.frozen) return;   /* hit stop must not advance the stepped sim */

        if (skillArmed >= 0) {
          skillArmTimer -= dt;
          if (skillArmTimer <= 0) { skillArmed = -1; updatePartyHud(); }
        }

        /* ---- board settle ---- */
        var k = 1 - Math.exp(-16 * dt);
        for (var c = 0; c < CELLS; c++) {
          var o = cellOff[c];
          if (o.dying > 0) {
            o.dying = Math.max(0, o.dying - dt / POP);
            var dd = 1 - o.dying;
            cellImg[c].setScale((L.cell * 0.98 / 72) * (1 + dd * 0.14 - dd * dd * 1.14));
            cellImg[c].setAlpha(o.dying);
            continue;
          }
          if (o.x !== 0 || o.y !== 0) {
            o.x -= o.x * k; o.y -= o.y * k;
            if (Math.abs(o.x) < 0.4) o.x = 0;
            if (Math.abs(o.y) < 0.4) o.y = 0;
            cellImg[c].setPosition(cx(RD.colOf(c)) + o.x, cy(RD.rowOf(c)) + o.y);
            if (bindImg[c].visible) bindImg[c].setPosition(cx(RD.colOf(c)) + o.x, cy(RD.rowOf(c)) + o.y);
          }
        }

        /* ---- player entity states: Ready, Lift, Resolve, Invalid ---- */
        if (run.mode === 'drag') {
          focusRing.setVisible(false);
          var over = RD.tickDrag(run, dt);
          timerRing.move(held.x, held.y, L.cell * 0.72);
          timerRing.set(run.timer / Math.max(0.01, run.moveTime));
          timerRing.setColor(run.timer < 1.5 ? 0xF25C68 : 0x76D8E2);
          var pulse = 1 + Math.sin(performance.now() / 90) * 0.02;
          held.setDisplaySize(L.cell * 1.10 * pulse, L.cell * 1.10 * pulse);
          RD.setVis(invalidMark, run.timer < 1.2);
          if (run.timer < 1.2) invalidMark.setPosition(held.x + L.cell * 0.5, held.y - L.cell * 0.5).setAlpha(0.85);
          if (keyHeld) held.setPosition(cx(RD.colOf(run.held)), cy(RD.rowOf(run.held)));
          if (over) { kit.audio.sfx('invalid'); release(); }
          teachAdvance(0);
        } else {
          RD.setVis(invalidMark, false);
          timerRing.clear();
          if (phase === 'idle') {
            focusRing.setVisible(true).setPosition(cx(RD.colOf(cursor)), cy(RD.rowOf(cursor)));
            var br = 1 + Math.sin(performance.now() / 380) * (kit.juice.enabled ? 0.035 : 0.012);
            focusRing.setDisplaySize(L.cell * 0.98 * br, L.cell * 0.98 * br);
            RD.setTint(focusRing, RD.depth(depthId).accent);
          } else focusRing.setVisible(false);
        }

        /* ---- party pose ---- */
        for (var p = 0; p < T.party; p++) {
          var st = slots[p];
          if (st.lean > 0) {
            st.lean = Math.max(0, st.lean - dt * 3.4);
            st.port.setPosition(st.x, st.y - 6 - Math.sin((1 - st.lean) * Math.PI) * 12);
          } else if (st.hurt > 0) {
            st.hurt = Math.max(0, st.hurt - dt * 3.0);
            st.port.setPosition(st.x + Math.sin(st.hurt * 46) * 4, st.y - 6);
            st.port.setAlpha(run.party[p].hp <= 0 ? 0.35 : 0.55 + 0.45 * (1 - st.hurt));
          } else if (st.port.x !== st.x) {
            st.port.setPosition(st.x, st.y - 6);
          }
        }
        if (foeImg.y !== L.foeCy) {
          foeImg.y += (L.foeCy - foeImg.y) * (1 - Math.exp(-9 * dt));
          if (Math.abs(foeImg.y - L.foeCy) < 0.3) foeImg.y = L.foeCy;
        }
        var fb = 1 + Math.sin(performance.now() / 620) * 0.012;
        foeImg.setDisplaySize(L.foeSize * fb, L.foeSize * fb);

        if (comboFade > 0) {
          comboFade -= dt;
          var ca = comboFade > 0.4 ? 1 : comboFade / 0.4;
          comboBg.setAlpha(ca * 0.94); comboIcon.setAlpha(ca); comboText.setAlpha(ca);
          if (comboFade <= 0) { RD.setVis(comboBg, false); RD.setVis(comboIcon, false); RD.setVis(comboText, false); }
        }

        /* ---- phase machine ---- */
        pt += dt;
        switch (phase) {
          case 'pop':
            if (pt >= POP) { applyBeatBoard(); phase = 'fall'; pt = 0; }
            break;
          case 'fall':
            if (pt >= FALL) {
              beatIx++;
              if (beatIx < plan.beats.length) { phase = 'pop'; pt = 0; startBeat(); }
              else { phase = 'strike'; pt = 0; doStrike(); }
            }
            break;
          case 'strike':
            if (pt >= STRIKE) {
              if (plan.roomCleared) { onRoomCleared(); }
              else if (plan.enemy) { phase = 'enemy'; pt = 0; doEnemy(); }
              else { phase = 'idle'; pt = 0; RD.readyTurn(run); }
            }
            break;
          case 'enemyWait':
            if (pt >= 0.35) {
              if (plan && plan.enemy) { phase = 'enemy'; pt = 0; doEnemy(); }
              else { phase = 'idle'; pt = 0; RD.readyTurn(run); run.mode = 'idle'; }
            }
            break;
          case 'enemy':
            if (pt >= ENEMY) {
              if (plan.enemy && plan.enemy.wipe) { queueWipe(); }
              else { phase = 'idle'; pt = 0; RD.readyTurn(run); run.mode = 'idle'; updatePartyHud(); }
            }
            break;
          case 'clear':
            if (pt >= CLEART) {
              if (plan && plan.runComplete || run.roomIndex >= run.roomList.length - 1) {
                finishDungeon();
                phase = 'over';
              } else {
                var r = RD.advanceRoom(run);
                if (!r) { finishDungeon(); phase = 'over'; }
                else {
                  notices.chip('Room ' + (run.roomIndex + 1) + ' of ' + run.roomList.length, 'descent', 0x5BCB77);
                  beginRoom(r);
                  updateHudTop();
                }
              }
              pendingClear = false;
            }
            break;
          case 'wipe':
            if (pt >= 0.5) { onWipe(); phase = 'over'; }
            break;
          case 'enter':
            if (pt >= 0.1) { phase = 'idle'; pt = 0; }
            break;
          default: break;
        }

        RD.hook.mode = descent ? 'descent' : 'dungeon';
        RD.hook.phase = phase;
        RD.hook.stage = dungeon ? dungeon.id : 0;
        RD.hook.room = run.roomIndex + 1;
        RD.hook.rooms = run.roomList.length;
        RD.hook.combo = run.bestCombo;
        RD.hook.health = Math.round(run.party.reduce(function (a, x) { return a + x.hp; }, 0));
        RD.hook.foeHp = run.foe ? Math.round(run.foe.hp) : 0;
        RD.hook.progress = (run.roomIndex + (run.foe ? 1 - run.foe.hp / run.foe.maxHp : 0)) / run.roomList.length;
        /* board geometry so a headless probe can address cells */
        RD.hook.board = { x: L.bx, y: L.by, cell: L.cell, w: W, h: H };
      }

      /* ---------------------------------------------------------- start */
      scene.scale.on('resize', layout);
      scene.events.once('shutdown', function () {
        scene.scale.off('resize', layout);
        clearPanelButtons();
        kit.onPauseHook = null;
        kit.onRestartHook = null;
      });

      kit.onPauseHook = function () {
        if (run.mode === 'drag') { RD.cancelDrag(run); held.setVisible(false); timerRing.clear(); redrawBoard(); }
      };
      kit.onRestartHook = function () { retry(); };

      layout();
      updateHudTop();
      var first = RD.enterRoom(run);
      beginRoom(first);
      RD.music(dungeon ? RD.depth(depthId).music : 'music_deep');
      if (dungeon) {
        notices.banner(dungeon.name, RD.depth(depthId).name, 0xF7C948, 1.4);
      } else {
        notices.banner('Daily Descent', descent.mod.name, 0x76D8E2, 1.6);
        coach.say(descent.mod.text, 4.4);
      }
      if (!dungeon || dungeon.id !== 1 || tutorialStep >= RD.TUTORIAL.length) {
        var lead0 = run.party[0];
        var lg0 = RD.guardStats(lead0.id, lead0.evolved ? 1 : 0);
        coach.say(lg0.name + ' leads. ' + lg0.skill, 4.0);
      }
      scene.__tick = tick;
    },

    update: function (time, delta) {
      if (this.__tick) this.__tick(delta / 1000);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
