/* Vanguard Four - heroes, kits, enemy stat tables (all original content) */
(function (root) {
  'use strict';
  var V = root.V;

  /* ============ HERO KITS ============ */
  /* Each kit: cd (seconds), range hint for bots, atk(h,G), sup(h,G), tick(h,G,dt) */

  var KIT_BLADE = {
    cd: 0.26, prefer: 46, botRange: 52, ranged: false,
    atk: function (h, G) {
      h.combo = (h.comboT > 0 ? (h.combo + 1) % 3 : 0);
      h.comboT = 0.62;
      var last = h.combo === 2;
      var d = last ? 96 : 44;
      h.dashT = last ? 0.16 : 0.10;
      h.dvx = Math.cos(h.a) * (d / h.dashT);
      h.dvy = Math.sin(h.a) * (d / h.dashT);
      G.addStrike({
        owner: h, follow: true, ox: 30, r: last ? 62 : 44, arc: last ? 2.5 : 1.5,
        dmg: last ? 26 : 13, knock: last ? 300 : 110, life: last ? 0.16 : 0.10,
        col: h.col, team: 1
      });
      G.fx.slashArc(h, last);
      V.sfx('slash');
      if (last) V.shake(3);
    },
    sup: function (h, G) {
      h.sup = { t: 1.5, timer: 0, n: 0 };
      h.inv = 1.6;
      V.sfx('super'); V.shake(8);
      G.fx.flash(h.col, 0.35);
    },
    tick: function (h, G, dt) {
      if (!h.sup) return;
      h.sup.t -= dt; h.sup.timer -= dt;
      if (h.sup.timer <= 0) {
        h.sup.timer = 0.15;
        var e = G.randomEnemy();
        if (e) {
          h.x = e.x - Math.cos(V.angTo(h, e)) * 0; h.a = V.angTo(h, e);
          h.x = e.x + V.rand(-30, 30); h.y = e.y + V.rand(-30, 30);
          h.a = V.angTo(h, e);
          G.addStrike({ x: e.x, y: e.y, r: 66, arc: 6.3, dmg: 34, knock: 220, life: 0.08, col: h.col, team: 1 });
          V.burst(e.x, e.y, 10, h.col, 220, 0.3, 3);
          V.ring(e.x, e.y, 40, h.col, 0.25);
          V.sfx('slash'); V.shake(3);
        }
        h.sup.n++;
      }
      if (h.sup.t <= 0) h.sup = null;
    }
  };

  var KIT_FIST = {
    cd: 0.52, prefer: 40, botRange: 46, ranged: false,
    atk: function (h, G) {
      h.combo = (h.comboT > 0 ? (h.combo + 1) % 2 : 0);
      h.comboT = 0.9;
      var slam = h.combo === 1;
      h.dashT = 0.08; h.dvx = Math.cos(h.a) * 130; h.dvy = Math.sin(h.a) * 130;
      if (slam) {
        G.addStrike({ x: h.x + Math.cos(h.a) * 22, y: h.y + Math.sin(h.a) * 22, r: 84, arc: 6.3, dmg: 30, knock: 330, life: 0.14, col: h.col, team: 1, stun: 0.5 });
        V.ring(h.x, h.y, 40, h.col, 0.32); V.ring(h.x, h.y, 66, '#ffd9a0', 0.28);
        V.burst(h.x, h.y, 16, h.col, 260, 0.4, 4);
        V.shake(6); V.sfx('heavy');
      } else {
        G.addStrike({ owner: h, follow: true, ox: 28, r: 50, arc: 2.0, dmg: 19, knock: 200, life: 0.12, col: h.col, team: 1 });
        V.ring(h.x + Math.cos(h.a) * 28, h.y + Math.sin(h.a) * 28, 26, h.col, 0.22);
        V.shake(2); V.sfx('heavy');
      }
      G.fx.slashArc(h, slam);
    },
    sup: function (h, G) {
      G.wells.push({ x: h.x + Math.cos(h.a) * 60, y: h.y + Math.sin(h.a) * 60, t: 1.15, max: 1.15, r: 200, owner: h });
      h.inv = 1.3;
      V.sfx('super'); V.shake(7);
      G.fx.flash(h.col, 0.3);
    },
    tick: function () { }
  };

  var KIT_LANTERN = {
    cd: 0.30, prefer: 190, botRange: 230, ranged: true,
    atk: function (h, G) {
      h.combo = (h.comboT > 0 ? (h.combo + 1) % 3 : 0);
      h.comboT = 1.0;
      var big = h.combo === 2;
      var sp = big ? 300 : 420;
      G.addProj({
        x: h.x + Math.cos(h.a) * 16, y: h.y + Math.sin(h.a) * 16,
        vx: Math.cos(h.a) * sp, vy: Math.sin(h.a) * sp,
        r: big ? 10 : 6, dmg: big ? 20 : 10, team: 1, col: h.col, life: 1.3,
        split: big ? 3 : 0
      });
      V.burst(h.x + Math.cos(h.a) * 16, h.y + Math.sin(h.a) * 16, 3, h.col, 90, 0.2, 2);
      V.sfx('shot');
    },
    sup: function (h, G) {
      G.novas.push({ x: h.x, y: h.y, t: 0.75, max: 0.75, r: 0, maxr: 380, dmg: 42, hit: [], col: h.col });
      for (var i = 0; i < G.heroes.length; i++) {
        var a = G.heroes[i];
        if (a.downed) { G.reviveHero(a, 0.6); }
        else a.hp = Math.min(a.max, a.hp + a.max * 0.45);
        V.ring(a.x, a.y, 26, '#ffe9a8', 0.4);
      }
      h.inv = 1.0;
      V.sfx('super'); V.shake(6);
      G.fx.flash('#ffe9a8', 0.4);
    },
    tick: function () { }
  };

  var KIT_STORM = {
    cd: 0.42, prefer: 130, botRange: 160, ranged: true,
    atk: function (h, G) {
      var targets = G.chainTargets(h.x, h.y, 165, 3);
      if (!targets.length) {
        // discharge forward if nothing near
        G.addStrike({ x: h.x + Math.cos(h.a) * 60, y: h.y + Math.sin(h.a) * 60, r: 46, arc: 6.3, dmg: 10, knock: 90, life: 0.08, col: h.col, team: 1 });
        G.bolts.push({ ax: h.x, ay: h.y, bx: h.x + Math.cos(h.a) * 90, by: h.y + Math.sin(h.a) * 90, t: 0.14, col: h.col });
        V.sfx('zap');
        return;
      }
      var px = h.x, py = h.y, dmg = 16;
      for (var i = 0; i < targets.length; i++) {
        var e = targets[i];
        G.bolts.push({ ax: px, ay: py, bx: e.x, by: e.y, t: 0.16, col: h.col });
        G.damageEnemy(e, dmg, h, 60, V.angTo({ x: px, y: py }, e), 0.18);
        V.burst(e.x, e.y, 5, h.col, 160, 0.25, 2.5);
        px = e.x; py = e.y; dmg *= 0.72;
      }
      V.sfx('zap'); V.shake(2);
    },
    sup: function (h, G) {
      h.sup = { t: 2.4, timer: 0 };
      h.inv = 0.6;
      V.sfx('super'); V.shake(6);
      G.fx.flash(h.col, 0.3);
    },
    tick: function (h, G, dt) {
      if (!h.sup) return;
      h.sup.t -= dt; h.sup.timer -= dt;
      if (h.sup.timer <= 0) {
        h.sup.timer = 0.11;
        var e = G.randomEnemy();
        if (e) {
          G.bolts.push({ ax: e.x + V.rand(-14, 14), ay: -20, bx: e.x, by: e.y, t: 0.14, col: h.col });
          G.addStrike({ x: e.x, y: e.y, r: 52, arc: 6.3, dmg: 22, knock: 110, life: 0.06, col: h.col, team: 1, stun: 0.2 });
          V.burst(e.x, e.y, 8, h.col, 200, 0.3, 3);
          V.sfx('zap');
        }
      }
      if (h.sup.t <= 0) h.sup = null;
    }
  };

  V.HEROES = [
    { name: 'RHEN', title: 'Blade Dash', col: '#3fd9c4', dark: '#0f5c42', max: 120, speed: 172, kit: KIT_BLADE, sym: 'blade' },
    { name: 'MORROW', title: 'Gravity Fist', col: '#ff9a3c', dark: '#6b3a0d', max: 165, speed: 132, kit: KIT_FIST, sym: 'fist' },
    { name: 'SELA', title: 'Arc Lantern', col: '#ffe45e', dark: '#6b5a10', max: 96, speed: 158, kit: KIT_LANTERN, sym: 'lamp' },
    { name: 'KADE', title: 'Storm Chain', col: '#b17cff', dark: '#3d2467', max: 110, speed: 150, kit: KIT_STORM, sym: 'bolt' }
  ];

  /* ============ ENEMIES ============ */
  V.ENEMIES = {
    husk: { name: 'Husk', hp: 34, speed: 62, r: 13, dmg: 9, col: '#8fa2b8', dark: '#39465a', score: 10, wind: 0.45, reach: 30, atkcd: 1.3 },
    skitter: { name: 'Skitter', hp: 16, speed: 118, r: 9, dmg: 6, col: '#ff6b8a', dark: '#5e1d2c', score: 8, wind: 0.25, reach: 24, atkcd: 0.8 },
    lobber: { name: 'Lobber', hp: 26, speed: 52, r: 12, dmg: 11, col: '#6fd3ff', dark: '#134759', score: 14, wind: 0.55, reach: 250, atkcd: 2.0 },
    bracer: { name: 'Bracer', hp: 88, speed: 44, r: 17, dmg: 15, col: '#c9b98f', dark: '#4d4229', score: 22, wind: 0.6, reach: 34, atkcd: 1.7 },
    sapper: { name: 'Sapper', hp: 24, speed: 96, r: 12, dmg: 26, col: '#ff5232', dark: '#5c1a0c', score: 18, wind: 0.9, reach: 34, atkcd: 9 },
    warden: { name: 'WARDEN', hp: 620, speed: 54, r: 34, dmg: 22, col: '#e8437a', dark: '#5c112e', score: 220, wind: 0.8, reach: 52, atkcd: 2.2, boss: true }
  };
})(window);
