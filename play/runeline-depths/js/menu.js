/* Runeline Depths - menu scene.
 * Title, depth map, roster and evolution, and the daily Descent brief.
 * Menus may breathe; gameplay may not, so this is where long text lives.
 */
(function (root) {
  'use strict';

  var RD = root.RD || {}; root.RD = RD;
  var Art = RD.Art;

  RD.MenuScene = {
    key: 'menu',

    create: function (data) {
      var scene = this;
      var kit = RD.kit;
      var profile = RD.profile;
      var L = { w: 390, h: 844, top: 0, bottom: 0 };
      var screen = (data && data.screen) || 'title';
      var container = null;
      var list = null, listH = 0, listTop = 0, listBottom = 0;
      var scrollY = 0, dragging = false, dragStart = 0, dragBase = 0, dragMoved = 0;
      var selectedSlot = 0;
      var motes = [];
      var depthId = RD.depth(RD.dungeon(RD.highestUnlocked(profile)).depth).id;

      var sky = scene.add.image(0, 0, 'sky-' + depthId).setOrigin(0, 0).setDepth(-20);
      var vig = scene.add.image(0, 0, 'px-vignette').setOrigin(0, 0).setDepth(-19).setAlpha(0.7);
      for (var i = 0; i < 10; i++) {
        var m = scene.add.image(0, 0, 'mote-' + depthId).setDepth(-18).setAlpha(0.3);
        m.__d = { x: Math.random(), y: Math.random(), vy: -7 - Math.random() * 12, ph: Math.random() * 6.28, sp: 0.4 + Math.random() * 0.7 };
        motes.push(m);
      }
      var notices = new RD.Notices(scene, kit);
      var coach = new RD.Coach(scene);

      function clearScreen() {
        if (container) { container.destroy(true); container = null; }
        list = null;
        scrollY = 0; dragging = false;
      }

      function go(next) {
        screen = next;
        kit.audio.sfx('ui_click');
        build();
      }

      /* ------------------------------------------------------- helpers */
      function card(x, y, w, h, tint, alpha) {
        var key = 'menu-card-' + Math.round(w) + 'x' + Math.round(h) + '-' + (tint || 0);
        if (!scene.textures.exists(key)) {
          Art.put(scene, key, Art.bakeCard(Math.round(w), Math.round(h), 14, tint == null ? 0x16223A : tint, 0x5D7294, alpha == null ? 0.94 : alpha));
        }
        return scene.add.image(x, y, key).setOrigin(0, 0);
      }
      function label(x, y, str, size, color, weight, origin) {
        var t = RD.text(scene, x, y, str, size, color, weight);
        if (origin) t.setOrigin(origin[0], origin[1]);
        return t;
      }
      function tappable(obj, fn, w, h) {
        obj.setInteractive(new Phaser.Geom.Rectangle(0, 0, Math.max(44, w), Math.max(44, h)), Phaser.Geom.Rectangle.Contains);
        obj.on('pointerup', function () { if (dragMoved < 10) fn(); });
        return obj;
      }

      function header(title, backTo) {
        var items = [];
        var t = label(backTo ? 62 : 16, L.top + 18, title, 20, '#F5F2E9', 800);
        items.push(t);
        if (backTo) {
          var b = new RD.Button(scene, 34, L.top + 30, 44, 44, '', {
            tint: 0x1B2743, onUp: function () { go(backTo); }
          });
          b.label.setVisible(false);
          var ic = scene.add.image(34, L.top + 30, 'icon-back').setDisplaySize(18, 18);
          b.parts.push(ic);
          items = items.concat(b.parts);
        }
        var rc = scene.add.image(L.w - 96, L.top + 30, 'ui-chip').setOrigin(0, 0.5).setDisplaySize(88, 30);
        var ri = scene.add.image(L.w - 82, L.top + 30, 'icon-rune').setDisplaySize(16, 16).setTint(0xF7C948);
        var rt = label(L.w - 68, L.top + 30, RD.fmt(profile.runes), 15, '#FFE6A6', 750, [0, 0.5]);
        items.push(rc, ri, rt);
        return items;
      }

      /* --------------------------------------------------------- title */
      function buildTitle() {
        var items = [];
        var cx = L.w / 2;
        var topY = L.top + Math.max(40, L.h * 0.10);

        var badge = scene.add.image(cx, topY + 42, 'badge-' + depthId).setDisplaySize(84, 84);
        items.push(badge);
        items.push(label(cx, topY + 118, 'RUNELINE', 34, '#FFF3D6', 800, [0.5, 0.5]));
        items.push(label(cx, topY + 152, 'DEPTHS', 34, '#F7C948', 800, [0.5, 0.5]));
        items.push(label(cx, topY + 186, 'Move one orb. Resolve the whole board.', 14, '#A9B9D2', 600, [0.5, 0.5]));

        /* the party you would descend with, so the title screen shows state */
        var pw = 46, pgap = 8, ptot = RD.TUNE.party * pw + (RD.TUNE.party - 1) * pgap;
        var py = topY + 226;
        for (var s = 0; s < RD.TUNE.party; s++) {
          var gid = profile.team[s];
          var evo = RD.evoLevel(profile, gid) === 1 && scene.textures.exists('guard-' + gid + '-e');
          var px = cx - ptot / 2 + s * (pw + pgap);
          items.push(card(px, py, pw, pw + 8, s === 0 ? 0x24365C : 0x16223A));
          items.push(scene.add.image(px + pw / 2, py + pw / 2, 'guard-' + gid + (evo ? '-e' : '')).setDisplaySize(pw - 12, pw - 12));
          items.push(label(px + pw / 2, py + pw + 0, s === 0 ? 'LEAD' : 'S' + (s + 1), 10,
            s === 0 ? '#FFE6A6' : '#7F90AE', 750, [0.5, 0.5]));
        }

        var cleared = Object.keys(profile.cleared).length;
        var y = Math.max(topY + 306, L.h * 0.52);
        var bw = Math.min(300, L.w - 56);

        var b1 = new RD.Button(scene, cx, y, bw, 54, 'Descend', {
          bright: true, tint: 0x3E7C63, icon: 'descent', size: 18,
          onUp: function () { go('map'); }
        });
        var b2 = new RD.Button(scene, cx, y + 66, bw, 50, 'Runeguards', {
          tint: 0x2A3A5C, icon: 'roster', onUp: function () { go('roster'); }
        });
        var b3 = new RD.Button(scene, cx, y + 128, bw, 50, 'Daily Descent', {
          tint: 0x2A3A5C, icon: 'clock', onUp: function () { go('descent'); }
        });
        var b4 = new RD.Button(scene, cx, y + 190, bw, 50, 'Settings', {
          tint: 0x22304C, icon: 'gear', onUp: function () { kit.openSettings([extraSettings]); }
        });
        items = items.concat(b1.parts, b2.parts, b3.parts, b4.parts);

        items.push(label(cx, L.h - L.bottom - 42, 'Depths cleared ' + cleared + ' of ' + RD.DUNGEONS.length +
          '   Runeguards ' + (profile.roster.length + RD.STARTERS.length) + ' of ' + RD.ALL_GUARDS.length, 13, '#8A9BB8', 600, [0.5, 0.5]));
        items.push(label(cx, L.h - L.bottom - 22, 'Best combo ' + profile.stats.bestCombo + '   Rooms cleared ' + profile.stats.rooms, 12, '#6F80A0', 600, [0.5, 0.5]));
        return items;
      }

      function extraSettings(box, row) {
        row('Reduced motion', function () { return !kit.juice.enabled; }, function (v) {
          kit.juice.enabled = !v;
        });
      }

      /* ----------------------------------------------------------- map */
      function buildMap() {
        var items = header('The Depths', 'title');
        listTop = L.top + 64;
        listBottom = L.h - L.bottom - 8;
        list = scene.add.container(0, 0);
        items.push(list);

        var y = 0;
        RD.DEPTHS.forEach(function (dep) {
          var head = scene.add.image(16, y + 16, 'badge-' + dep.id).setOrigin(0, 0).setDisplaySize(34, 34);
          list.add(head);
          list.add(label(58, y + 18, dep.name, 17, '#F5F2E9', 750));
          list.add(label(58, y + 38, dep.blurb, 12, '#8A9BB8', 600));
          y += 62;

          RD.DUNGEONS.filter(function (d) { return d.depth === dep.id; }).forEach(function (d) {
            var unlocked = RD.dungeonUnlocked(profile, d);
            var clears = profile.cleared[d.id] || 0;
            var w = L.w - 32, h = 74;
            var c = card(16, y, w, h, unlocked ? 0x16223A : 0x121A2B, unlocked ? 0.94 : 0.8);
            list.add(c);
            var badge = scene.add.image(30, y + 16, 'badge-' + dep.id).setOrigin(0, 0).setDisplaySize(42, 42);
            badge.setAlpha(unlocked ? 1 : 0.4);
            list.add(badge);
            list.add(label(84, y + 12, d.name, 16, unlocked ? '#F2F6FF' : '#6F80A0', 750));
            list.add(label(84, y + 33, RD.roomCount(d) + ' rooms   boss ' + RD.enemy(d.boss).name, 12, '#93A4C2', 600));
            var foot = 'Runes ' + RD.dungeonReward(d, clears === 0);
            if (d.drop && clears === 0) foot += '   recruits ' + RD.guard(d.drop).name;
            else if (clears > 0) foot += '   cleared ' + clears;
            list.add(label(84, y + 51, foot, 12, clears > 0 ? '#8FE3A6' : '#C9A16A', 600));
            if (!unlocked) {
              var lk = scene.add.image(w - 6, y + h / 2, 'icon-lock').setDisplaySize(20, 20).setAlpha(0.6);
              list.add(lk);
            } else if (clears > 0) {
              var ck = scene.add.image(w - 6, y + h / 2, 'icon-check').setDisplaySize(20, 20).setTint(0x5BCB77);
              list.add(ck);
            }
            if (unlocked) {
              tappable(c, function () {
                kit.audio.sfx('ui_click');
                scene.scene.start('play', { mode: 'dungeon', dungeonId: d.id });
              }, w, h);
            }
            y += h + 8;
          });
          y += 10;
        });
        listH = y;
        list.y = listTop;
        return items;
      }

      /* -------------------------------------------------------- roster */
      function buildRoster() {
        var items = header('Runeguards', 'title');
        var teamY = L.top + 66;
        items.push(label(16, teamY - 4, 'Party of five. Slot one leads.', 13, '#93A4C2', 600));

        var slotW = Math.floor((L.w - 32 - 4 * 6) / 5);
        var slotObjs = [];
        for (var s = 0; s < RD.TUNE.party; s++) {
          (function (n) {
            var x = 16 + n * (slotW + 6);
            var c = card(x, teamY + 18, slotW, 78, n === selectedSlot ? 0x27406B : 0x16223A);
            var gid = profile.team[n];
            var evo = RD.evoLevel(profile, gid) === 1 && scene.textures.exists('guard-' + gid + '-e');
            var p = scene.add.image(x + slotW / 2, teamY + 48, 'guard-' + gid + (evo ? '-e' : '')).setDisplaySize(42, 42);
            var nm = label(x + slotW / 2, teamY + 82, n === 0 ? 'LEAD' : 'S' + (n + 1), 11, n === 0 ? '#FFE6A6' : '#93A4C2', 750, [0.5, 0.5]);
            tappable(c, function () { selectedSlot = n; kit.audio.sfx('ui_click'); build(); }, slotW, 78);
            items.push(c, p, nm);
            slotObjs.push(c);
          })(s);
        }

        var lead = RD.guardStats(profile.team[0], RD.evoLevel(profile, profile.team[0]));
        var leadLbl = label(16, teamY + 104, lead.skill, 13, '#CFE0F2', 600);
        leadLbl.setWordWrapWidth(L.w - 32);
        items.push(leadLbl);

        listTop = teamY + 108 + Math.max(20, leadLbl.height) + 8;
        listBottom = L.h - L.bottom - 8;
        list = scene.add.container(0, 0);
        items.push(list);

        var owned = RD.ownedGuards(profile);
        var y = 0;
        owned.forEach(function (gid) {
          var lvl = RD.evoLevel(profile, gid);
          var st = RD.guardStats(gid, lvl);
          var canEvoRow = RD.canEvolve(gid) && lvl === 0 && profile.roster.indexOf(gid) >= 0;
          var w = L.w - 32, h = 104;
          var c = card(16, y, w, h);
          list.add(c);
          var evoTex = lvl === 1 && scene.textures.exists('guard-' + gid + '-e');
          var p = scene.add.image(30, y + 10, 'guard-' + gid + (evoTex ? '-e' : '')).setOrigin(0, 0).setDisplaySize(56, 56);
          list.add(p);
          var og = scene.add.image(46, y + 76, 'px-dot').setDisplaySize(10, 10).setTint(RD.orb(st.el).color);
          list.add(og);
          list.add(label(96, y + 10, st.name, 16, '#F2F6FF', 750));
          list.add(label(96, y + 31, RD.orb(st.el).label + '   atk ' + st.atk + '   hp ' + st.hp, 12, '#93A4C2', 600));
          var sk = label(96, y + 49, st.skill, 12, '#CFE0F2', 600);
          sk.setWordWrapWidth(w - 96 - (canEvoRow || lvl === 1 ? 106 : 12));
          list.add(sk);

          var canEvo = canEvoRow;
          if (canEvo) {
            var cost = RD.evolveCost(gid);
            var afford = profile.runes >= cost;
            var eb = new RD.Button(scene, w - 46, y + 62, 96, 34, RD.fmt(cost), {
              tint: afford ? 0x3E7C63 : 0x2A3A5C, size: 14, icon: 'rune',
              onUp: function () {
                if (dragMoved >= 10) return;
                if (!RD.doEvolve(profile, gid)) {
                  kit.audio.sfx('invalid');
                  notices.chip('Not enough runes', 'rune', 0xF25C68);
                  return;
                }
                RD.saveProfile();
                kit.audio.sfx('evolve');
                notices.chip(RD.guard(gid).evo.name, 'check', 0xF7C948);
                build();
              }
            });
            eb.setEnabled(afford);
            eb.parts.forEach(function (o) { list.add(o); });
          } else if (lvl === 1) {
            var done = scene.add.image(w - 20, y + 62, 'icon-check').setDisplaySize(18, 18).setTint(0xF7C948);
            list.add(done);
            list.add(label(w - 36, y + 62, 'Evolved', 12, '#FFE6A6', 700, [1, 0.5]));
          }

          tappable(c, function () {
            profile.team[selectedSlot] = gid;
            RD.saveProfile();
            kit.audio.sfx('ui_click');
            build();
          }, w, h);
          y += h + 8;
        });
        listH = y;
        list.y = listTop;
        return items;
      }

      /* ------------------------------------------------------- descent */
      function buildDescent() {
        var items = header('Daily Descent', 'title');
        var day = RD.todayKey();
        var des = RD.buildDescent(day);
        var cx = L.w / 2;
        var y = L.top + 84;
        var w = L.w - 32;

        items.push(card(16, y, w, 128));
        items.push(label(32, y + 14, day, 13, '#93A4C2', 600));
        items.push(label(32, y + 36, des.mod.name, 20, '#76D8E2', 750));
        var mt = label(32, y + 64, des.mod.text, 14, '#CFE0F2', 600);
        mt.setWordWrapWidth(w - 32);
        items.push(mt);
        items.push(label(32, y + 100, 'Six rooms. One boss. No retreat.', 13, '#8A9BB8', 600));

        var d = profile.descent;
        var todays = d.day === day;
        items.push(label(cx, y + 156, todays
          ? 'Today: ' + d.rooms + ' of 6 rooms' + (d.cleared ? ', cleared' : '')
          : 'Not attempted today', 15, todays && d.cleared ? '#8FE3A6' : '#CFE0F2', 700, [0.5, 0.5]));

        items.push(label(cx, y + 182, 'Descent runs use your current party and never drop runeguards.', 12, '#8A9BB8', 600, [0.5, 0.5]));

        var b = new RD.Button(scene, cx, y + 232, Math.min(280, w), 54, 'Begin the Descent', {
          bright: true, tint: 0x2F6E86, icon: 'descent', size: 17,
          onUp: function () { kit.audio.sfx('ui_click'); scene.scene.start('play', { mode: 'descent' }); }
        });
        items = items.concat(b.parts);

        /* today's route, so the player can pick a party before descending */
        var ry = y + 280;
        items.push(label(16, ry, "Today's route", 15, '#F5F2E9', 750));
        des.rooms.forEach(function (rm, i) {
          var e = RD.enemy(rm.enemy);
          var ryy = ry + 26 + i * 40;
          items.push(card(16, ryy, w, 34, rm.boss ? 0x2A2036 : 0x16223A));
          var dot = scene.add.image(32, ryy + 17, 'px-dot').setDisplaySize(12, 12).setTint(RD.orb(e.el).color);
          items.push(dot);
          items.push(label(50, ryy + 17, (i + 1) + '. ' + e.name, 14, rm.boss ? '#FFE6A6' : '#CFE0F2', rm.boss ? 750 : 600, [0, 0.5]));
          if (rm.boss) {
            var sk = scene.add.image(w - 4, ryy + 17, 'icon-skull').setDisplaySize(16, 16).setTint(0xF25C68);
            items.push(sk);
          }
        });
        return items;
      }

      /* --------------------------------------------------------- build */
      function build() {
        clearScreen();
        container = scene.add.container(0, 0);
        var items;
        if (screen === 'map') items = buildMap();
        else if (screen === 'roster') items = buildRoster();
        else if (screen === 'descent') items = buildDescent();
        else items = buildTitle();
        items.forEach(function (o) { if (o) container.add(o); });
        container.setDepth(10);
        RD.hook.mode = 'menu';
        RD.hook.stage = screen;
        RD.hook.progress = Object.keys(profile.cleared).length / RD.DUNGEONS.length;
      }

      /* -------------------------------------------------------- layout */
      /* Phaser RESIZE mode re-fires against document.body, so without this
         guard a one pixel wobble rebuilds the whole screen every frame. */
      var laidOut = false;
      function layout() {
        var ins = RD.insets();
        var w = Math.round(scene.scale.width), h = Math.round(scene.scale.height);
        if (laidOut && w === L.w && h === L.h && ins.top === L.top && ins.bottom === L.bottom) return;
        laidOut = true;
        L.w = w; L.h = h;
        L.top = ins.top; L.bottom = ins.bottom;
        L.chipY = L.top + 78;
        L.coachY = L.top + 56;
        sky.setDisplaySize(L.w, L.h);
        vig.setDisplaySize(L.w, L.h);
        notices.layout(L);
        coach.layout(L);
        build();
      }

      /* --------------------------------------------------------- input */
      scene.input.on('pointerdown', function (p) {
        if (!list) return;
        dragging = true; dragStart = p.y; dragBase = scrollY; dragMoved = 0;
      });
      scene.input.on('pointermove', function (p) {
        if (!dragging || !list) return;
        var d = p.y - dragStart;
        dragMoved = Math.max(dragMoved, Math.abs(d));
        scrollY = dragBase + d;
        var min = Math.min(0, (listBottom - listTop) - listH);
        scrollY = Math.max(min, Math.min(0, scrollY));
        list.y = listTop + scrollY;
      });
      function endDrag() { dragging = false; window.setTimeout(function () { dragMoved = 0; }, 0); }
      scene.input.on('pointerup', endDrag);
      scene.input.on('pointerupoutside', endDrag);
      scene.input.on('wheel', function (p, o, dx, dy) {
        if (!list) return;
        scrollY -= dy * 0.5;
        var min = Math.min(0, (listBottom - listTop) - listH);
        scrollY = Math.max(min, Math.min(0, scrollY));
        list.y = listTop + scrollY;
      });
      scene.input.keyboard.on('keydown', function (e) {
        if (e.code === 'Escape') { if (screen !== 'title') go('title'); }
        else if (e.code === 'Enter' || e.code === 'Space') {
          if (screen === 'title') { e.preventDefault(); go('map'); }
        } else if (list && (e.code === 'ArrowDown' || e.code === 'ArrowUp')) {
          e.preventDefault();
          scrollY += e.code === 'ArrowDown' ? -48 : 48;
          var min = Math.min(0, (listBottom - listTop) - listH);
          scrollY = Math.max(min, Math.min(0, scrollY));
          list.y = listTop + scrollY;
        }
      });

      scene.scale.on('resize', layout);
      scene.events.once('shutdown', function () {
        scene.scale.off('resize', layout);
      });

      layout();
      RD.music('music_hall');

      scene.__tick = function (dt) {
        for (var i = 0; i < motes.length; i++) {
          var m = motes[i], d = m.__d;
          d.y += (d.vy / Math.max(1, L.h)) * dt;
          if (d.y < -0.05) { d.y = 1.05; d.x = Math.random(); }
          d.ph += dt * d.sp;
          m.setPosition(d.x * L.w + Math.sin(d.ph) * 14, d.y * L.h);
          m.setAlpha(0.16 + 0.16 * (0.5 + 0.5 * Math.sin(d.ph * 1.6)));
          m.setDisplaySize(18 + (i % 3) * 8, 18 + (i % 3) * 8);
        }
        notices.update(dt);
        coach.update(dt);
      };
    },

    update: function (time, delta) {
      if (this.__tick) this.__tick(Math.min(0.05, delta / 1000));
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
