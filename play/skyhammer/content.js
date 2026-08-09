/* Skyhammer - content: seeded wave grammar + boss pattern grammar */
(function (SH) {
  'use strict';
  var W = 360;

  var COL = {
    aimed: '#ff5f9e',
    fan: '#ffb14c',
    spiral: '#62e8ff',
    wall: '#b07cff',
    ring: '#ff7d5c',
    arms: '#7cf5c0',
    rain: '#8fa6ff'
  };

  var STAGE_THEME = [
    { sky: ['#070c1c', '#101a3a'], band: '#1b2b5e', star: '#8fb4ff', name: 'DAWN SHELF' },
    { sky: ['#150a1e', '#33113c'], band: '#4a1a53', star: '#ffa7e6', name: 'EMBER REACH' },
    { sky: ['#04161a', '#0b3340'], band: '#125464', star: '#7ff0e0', name: 'STORM VAULT' }
  ];

  function enemy(o) {
    return {
      x: o.x, y: o.y, tx: o.tx, ty: o.ty,
      speed: o.speed || 120,
      hold: o.hold === undefined ? 2.5 : o.hold,
      ovx: o.ovx || 0, ovy: o.ovy === undefined ? 130 : o.ovy,
      hp: o.hp, r: o.r || 12, kind: o.kind || 'drone',
      color: o.color || '#cfe4ff', pat: o.pat, delay: o.delay || 0,
      score: o.score || 200, sway: o.sway || 0
    };
  }

  function makeWave(kind, s, rng, t) {
    var list = [], i, n;
    var spd = 1 + s * 0.16;
    if (kind === 'aimed') {
      n = 5;
      var dir = rng.chance(0.5) ? 1 : -1;
      for (i = 0; i < n; i++) {
        var x = 52 + i * ((W - 104) / (n - 1));
        list.push(enemy({
          x: x, y: -24 - i * 16, tx: x + dir * 24, ty: 130 + (i % 2) * 34,
          speed: 150, hold: 2.2, ovy: 175, ovx: dir * 30,
          hp: 6 + s * 3, r: 11, kind: 'drone', color: '#ffd0e2', score: 180,
          delay: i * 0.16,
          pat: { kind: 'aimed', period: rng.range(1.0, 1.4), n: 2 + s, spread: 0.15, speed: (128 + s * 22) * 1, c: COL.aimed, r: 4 }
        }));
      }
    } else if (kind === 'fan') {
      n = rng.int(2, 3);
      for (i = 0; i < n; i++) {
        var side = (i % 2 === 0) ? -1 : 1;
        var fx = side < 0 ? 78 + i * 22 : W - 78 - i * 22;
        list.push(enemy({
          x: side < 0 ? -30 : W + 30, y: 70 + i * 40,
          tx: fx, ty: 96 + i * 42, speed: 130, hold: 3.4,
          ovx: side * 90, ovy: 40, sway: 1,
          hp: 16 + s * 7, r: 15, kind: 'pod', color: '#ffd9a8', score: 420,
          delay: i * 0.35,
          pat: { kind: 'fan', period: rng.range(1.4, 1.9), n: 7 + s * 2, spread: 0.85 + s * 0.12, speed: 108 * spd, c: COL.fan, r: 4.5 }
        }));
      }
    } else if (kind === 'spiral') {
      n = s >= 2 && rng.chance(0.5) ? 2 : 1;
      for (i = 0; i < n; i++) {
        var sx = n === 1 ? W * 0.5 : (i === 0 ? W * 0.3 : W * 0.7);
        list.push(enemy({
          x: sx, y: -30, tx: sx, ty: 120, speed: 110, hold: 4.2, ovy: 120, sway: 1,
          hp: 26 + s * 10, r: 17, kind: 'orb', color: '#b9f0ff', score: 700,
          delay: i * 0.5,
          pat: {
            kind: 'spiral', period: 0.085, arms: 2 + (s % 3), rate: (rng.chance(0.5) ? 1 : -1) * (2.0 + s * 0.35),
            speed: 92 * spd, c: COL.spiral, r: 4
          }
        }));
      }
      // escorts
      for (i = 0; i < 2; i++) {
        var ex = i === 0 ? 46 : W - 46;
        list.push(enemy({
          x: ex, y: -20, tx: ex, ty: 200, speed: 150, hold: 1.6, ovy: 190,
          hp: 6 + s * 2, r: 10, kind: 'drone', color: '#ffd0e2', score: 150, delay: 0.9,
          pat: { kind: 'aimed', period: 1.3, n: 1 + s, spread: 0.1, speed: 140 * spd, c: COL.aimed, r: 4 }
        }));
      }
    } else { // wall
      n = 3;
      for (i = 0; i < n; i++) {
        var wx = 70 + i * ((W - 140) / (n - 1));
        list.push(enemy({
          x: wx, y: -26, tx: wx, ty: 74, speed: 120, hold: 3.6, ovy: 150,
          hp: 14 + s * 6, r: 14, kind: 'block', color: '#dcc4ff', score: 380,
          delay: i * 0.5,
          pat: {
            kind: 'wall', period: rng.range(1.7, 2.2), count: 13 + s * 2, gap: 62 - s * 5,
            speed: 100 * spd, c: COL.wall, r: 4.5, seed: rng.int(1, 9999)
          }
        }));
      }
    }
    return { t: t, list: list };
  }

  function makeMove(kind, s, rng, tier) {
    var spd = 1 + s * 0.15 + tier * 0.08;
    if (kind === 'ring') {
      return {
        kind: 'ring', dur: rng.range(3.4, 4.4), period: rng.range(0.5, 0.75),
        n: 12 + s * 3 + tier * 3, spin: rng.range(0.12, 0.34) * (rng.chance(0.5) ? 1 : -1),
        speed: 96 * spd, c: COL.ring, r: 4.5, aim: rng.chance(0.4)
      };
    }
    if (kind === 'arms') {
      return {
        kind: 'arms', dur: rng.range(4.0, 5.2), period: 0.075,
        arms: 2 + ((s + tier) % 4), rate: (2.0 + s * 0.4 + tier * 0.3) * (rng.chance(0.5) ? 1 : -1),
        speed: 90 * spd, c: COL.arms, r: 4, sweep: rng.chance(0.5)
      };
    }
    if (kind === 'aimed') {
      return {
        kind: 'aimed', dur: rng.range(3.0, 4.0), period: rng.range(0.75, 1.05),
        n: 3 + s + tier, spread: 0.22 + tier * 0.05, burst: 2 + tier,
        speed: 132 * spd, c: COL.aimed, r: 4
      };
    }
    if (kind === 'wall') {
      return {
        kind: 'wall', dur: rng.range(3.6, 4.6), period: rng.range(1.0, 1.35),
        count: 15 + s * 2 + tier * 2, gap: 66 - s * 5 - tier * 4,
        speed: 104 * spd, c: COL.wall, r: 4.5, seed: rng.int(1, 9999)
      };
    }
    return {
      kind: 'rain', dur: rng.range(3.0, 4.0), period: Math.max(0.06, 0.16 - s * 0.02 - tier * 0.02),
      speed: 118 * spd, c: COL.rain, r: 3.6, seed: rng.int(1, 9999)
    };
  }

  var BOSS_NAMES = ['KESTREL FRAME', 'VAULT CHOIR', 'SKYHAMMER PRIME'];

  function makeBoss(s, rng) {
    var kinds = ['ring', 'arms', 'aimed', 'wall', 'rain'];
    var phases = [];
    var baseHP = [250, 310, 380];
    for (var p = 0; p < 3; p++) {
      var pool = kinds.slice();
      var moves = [];
      var cnt = 2 + (p > 0 ? 1 : 0);
      // grammar: each phase always contains one "aimed pressure" move plus 1-2 geometric moves
      moves.push(makeMove(p === 0 ? 'aimed' : rng.pick(['aimed', 'rain']), s, rng, p));
      for (var m = 0; m < cnt; m++) {
        var k = rng.pick(pool);
        pool.splice(pool.indexOf(k), 1);
        if (!pool.length) pool = kinds.slice();
        moves.push(makeMove(k, s, rng, p));
      }
      phases.push({
        hp: Math.round(baseHP[p] * (1 + s * 0.3)),
        pods: p < 2 ? 2 : 2,
        podHP: Math.round(85 * (1 + s * 0.25)),
        moves: moves
      });
    }
    return { name: BOSS_NAMES[s], phases: phases };
  }

  function makeStage(s) {
    var rng = SH.rngObj(90210 + s * 7919);
    var waves = [];
    var t = 1.6;
    var nW = 8 + s;
    var kinds = ['aimed', 'fan', 'spiral', 'wall'];
    for (var i = 0; i < nW; i++) {
      var kind = (i % 4 === 3) ? 'wall' : (i === 0 ? 'aimed' : rng.pick(kinds));
      waves.push(makeWave(kind, s, rng, t));
      t += Math.max(3.0, rng.range(4.3, 6.0) - s * 0.3);
    }
    return {
      index: s, theme: STAGE_THEME[s], waves: waves,
      bossAt: t + 2.0, boss: makeBoss(s, rng)
    };
  }

  SH.makeStage = makeStage;
  SH.COL = COL;
})(SH);
