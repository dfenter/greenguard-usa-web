/* Skyhammer - sh_content.js
 * Authored world design and the seeded wave grammar that fills it.
 *
 * Four stage identities, each with its own pattern grammar, enemy cast,
 * palette, difficulty ramp, signature boss silhouette and one discoverable
 * graze-route bonus. A fifth entry is the unlockable finale, which is a boss
 * encounter with no waves.
 *
 * Everything below is data plus pure functions. No Phaser, no DOM. Every
 * keyed lookup in here resolves through a guarded accessor, because a
 * FAMILY[variant] miss hard-froze a shipped title in this fleet.
 */
var SHContent = (function () {
  'use strict';

  var TAU = Math.PI * 2;
  var BASE_W = 360;

  /* ------------------------------------------------------------- random */
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function rngObj(seed) {
    var f = mulberry32((seed >>> 0) || 1);
    return {
      r: f,
      range: function (a, b) { return a + f() * (b - a); },
      int: function (a, b) { return Math.floor(a + f() * (b - a + 1)); },
      pick: function (arr) { return arr.length ? arr[Math.floor(f() * arr.length) % arr.length] : null; },
      chance: function (p) { return f() < p; }
    };
  }

  /* -------------------------------------------------------- stage table */
  /* theme colours are 0xRRGGBB tints applied to the shared baked bg tiles,
   * so four distinct skies cost zero extra payload. */
  var STAGES = [
    {
      key: 'dawn', name: 'DAWN SHELF', sub: 'Aimed streams off the shelf',
      grammar: 'aimed', mix: ['aimed', 'aimed', 'fan', 'aimed', 'wall'],
      cast: ['drone', 'lancer'], waves: 8, tier: 1.0, seed: 0x51F17,
      scroll: 1.0,
      theme: { top: 0x070c1c, bot: 0x16224a, neb: 0x2b4a9e, band: 0x4f7ad8, star: 0xbfd6ff },
      boss: 'kestrel', gateWave: 3,
      medal: { bronze: 35000, silver: 80000, silverGraze: 100, gold: 140000, goldGraze: 180 }
    },
    {
      key: 'ember', name: 'EMBER REACH', sub: 'Fans open across the reach',
      grammar: 'fan', mix: ['fan', 'fan', 'aimed', 'spiral', 'fan', 'wall'],
      cast: ['pod', 'drone', 'lancer'], waves: 9, tier: 2.3, seed: 0x6A21D,
      scroll: 1.18,
      theme: { top: 0x180a1c, bot: 0x4a1a3c, neb: 0xb04a6e, band: 0xff9a5c, star: 0xffd0e2 },
      boss: 'choir', gateWave: 4,
      medal: { bronze: 55000, silver: 110000, silverGraze: 140, gold: 185000, goldGraze: 240 }
    },
    {
      key: 'storm', name: 'STORM VAULT', sub: 'Spiral gauntlet, no still air',
      grammar: 'spiral', mix: ['spiral', 'spiral', 'ring', 'aimed', 'spiral', 'fan'],
      cast: ['orb', 'drone', 'pod'], waves: 10, tier: 3.7, seed: 0x7C3B9,
      scroll: 1.4,
      theme: { top: 0x04161a, bot: 0x0b3a48, neb: 0x1d8ea0, band: 0x7ff0e0, star: 0xd6ffff },
      boss: 'weaver', gateWave: 5,
      medal: { bronze: 75000, silver: 140000, silverGraze: 180, gold: 235000, goldGraze: 300 }
    },
    {
      key: 'iron', name: 'IRON MERIDIAN', sub: 'Walls with gaps, and the gaps move',
      grammar: 'wall', mix: ['wall', 'wall', 'rain', 'spiral', 'wall', 'arms'],
      cast: ['block', 'pod', 'lancer', 'orb'], waves: 11, tier: 5.2, seed: 0x8D4E5,
      scroll: 1.62,
      theme: { top: 0x120a20, bot: 0x2e1a58, neb: 0x7c4ad0, band: 0xb07cff, star: 0xe4d6ff },
      boss: 'bastion', gateWave: 6,
      medal: { bronze: 95000, silver: 175000, silverGraze: 220, gold: 290000, goldGraze: 360 }
    },
    {
      key: 'hammerfall', name: 'HAMMERFALL', sub: 'It was never a stage. It was waiting.',
      grammar: 'arms', mix: ['arms', 'ring', 'wall', 'rain'],
      cast: ['lancer', 'orb'], waves: 0, tier: 7.0, seed: 0x9E5F1,
      scroll: 1.85,
      theme: { top: 0x1a0808, bot: 0x4a1410, neb: 0xd06030, band: 0xff8a4c, star: 0xffe0c0 },
      boss: 'prime', gateWave: -1,
      medal: { bronze: 60000, silver: 130000, silverGraze: 120, gold: 220000, goldGraze: 200 }
    }
  ];
  var STAGE_BY_KEY = {};
  (function () { for (var i = 0; i < STAGES.length; i++) STAGE_BY_KEY[STAGES[i].key] = STAGES[i]; })();

  function stageAt(i) {
    var n = (i | 0);
    if (!(n >= 0 && n < STAGES.length)) n = 0;   // guarded: NaN falls through too
    return STAGES[n];
  }
  var CAMPAIGN_COUNT = 4;      // stages 0..3 are the run; 4 is the finale
  var FINALE_INDEX = 4;

  /* -------------------------------------------------------- boss table */
  /* Each boss is authored: name, silhouette key, phase count, pod layout and
   * a fixed move grammar per phase. The seeded rng only tunes numbers inside
   * the authored shape, so a boss always FEELS like itself. */
  var BOSSES = {
    kestrel: {
      name: 'KESTREL FRAME', title: 'Shelf Interceptor', art: 'kestrel',
      hp: [260, 330, 400], podHP: 90, podRows: [2, 2, 3], podSpread: 52,
      moveGrammar: [
        ['aimed', 'fan'],
        ['aimed', 'ring', 'fan'],
        ['aimed', 'ring', 'rain']
      ]
    },
    choir: {
      name: 'VAULT CHOIR', title: 'Ember Cantor', art: 'choir',
      hp: [300, 380, 470], podHP: 105, podRows: [3, 2, 3], podSpread: 58,
      moveGrammar: [
        ['fan', 'ring'],
        ['fan', 'arms', 'aimed'],
        ['fan', 'wall', 'ring', 'rain']
      ]
    },
    weaver: {
      name: 'CORONA WEAVER', title: 'Vault Spinner', art: 'weaver',
      hp: [340, 430, 540], podHP: 120, podRows: [2, 3, 4], podSpread: 62,
      moveGrammar: [
        ['arms', 'aimed'],
        ['arms', 'ring', 'spiralWall'],
        ['arms', 'ring', 'rain', 'aimed']
      ]
    },
    bastion: {
      name: 'BASTION GATE', title: 'Meridian Bulwark', art: 'bastion',
      hp: [400, 500, 640], podHP: 140, podRows: [3, 3, 4], podSpread: 66,
      moveGrammar: [
        ['wall', 'aimed'],
        ['wall', 'arms', 'ring'],
        ['wall', 'rain', 'arms', 'aimed']
      ]
    },
    prime: {
      name: 'SKYHAMMER PRIME', title: 'The Last Pattern', art: 'prime',
      hp: [520, 660, 820, 980], podHP: 165, podRows: [3, 4, 4, 5], podSpread: 70,
      moveGrammar: [
        ['aimed', 'wall', 'ring'],
        ['arms', 'fan', 'rain'],
        ['spiralWall', 'ring', 'arms', 'aimed'],
        ['arms', 'wall', 'ring', 'rain', 'fan']
      ]
    }
  };
  function bossDef(key) { return BOSSES[key] || BOSSES.kestrel; }

  /* ----------------------------------------------------- move factory */
  /* A move is one boss attack: kind, duration, cadence, and the bullet lane
   * that colour-codes it. Lane and kind are deliberately 1:1 so the colour
   * teaches the motion. */
  var MOVE_BUILD = {
    aimed: function (t, rng) {
      return {
        kind: 'aimed', lane: 'aimed', size: 'm',
        dur: rng.range(3.2, 4.2), period: Math.max(0.42, 0.95 - t * 0.045),
        n: 3 + Math.min(6, Math.round(t * 0.7)), spread: 0.2 + t * 0.012,
        burst: 2 + Math.min(3, Math.floor(t / 3)), speed: 132 + t * 9
      };
    },
    fan: function (t, rng) {
      return {
        kind: 'fan', lane: 'fan', size: 'm',
        dur: rng.range(3.4, 4.4), period: Math.max(0.55, 1.35 - t * 0.05),
        n: 7 + Math.min(12, Math.round(t * 1.1)), spread: 0.9 + t * 0.03,
        speed: 108 + t * 8, sweep: rng.chance(0.5) ? 1 : -1
      };
    },
    ring: function (t, rng) {
      return {
        kind: 'ring', lane: 'ring', size: 'm',
        dur: rng.range(3.4, 4.6), period: Math.max(0.34, 0.72 - t * 0.028),
        n: 12 + Math.min(18, Math.round(t * 1.6)),
        spin: rng.range(0.1, 0.32) * (rng.chance(0.5) ? 1 : -1),
        speed: 96 + t * 7, aim: rng.chance(0.45)
      };
    },
    arms: function (t, rng) {
      return {
        kind: 'arms', lane: 'arms', size: 's',
        dur: rng.range(4.0, 5.4), period: 0.075,
        arms: 2 + (Math.round(t) % 4), rate: (1.9 + t * 0.18) * (rng.chance(0.5) ? 1 : -1),
        speed: 90 + t * 6, sweep: rng.chance(0.5)
      };
    },
    wall: function (t, rng) {
      return {
        kind: 'wall', lane: 'wall', size: 'm',
        dur: rng.range(3.6, 4.8), period: Math.max(0.72, 1.3 - t * 0.05),
        count: 15 + Math.min(11, Math.round(t)), gap: Math.max(40, 74 - t * 3.4),
        speed: 104 + t * 7, drift: rng.range(-26, 26), seed: rng.int(1, 99999)
      };
    },
    rain: function (t, rng) {
      return {
        kind: 'rain', lane: 'rain', size: 's',
        dur: rng.range(3.0, 4.2), period: Math.max(0.045, 0.16 - t * 0.008),
        speed: 118 + t * 7, seed: rng.int(1, 99999)
      };
    },
    spiral: function (t, rng) {
      return {
        kind: 'arms', lane: 'spiral', size: 's',
        dur: rng.range(3.6, 4.8), period: 0.08,
        arms: 3 + (Math.round(t) % 3), rate: (2.3 + t * 0.2) * (rng.chance(0.5) ? 1 : -1),
        speed: 94 + t * 6, sweep: false
      };
    },
    /* Signature composite: a wall whose gap orbits, so the safe lane has to
     * be tracked rather than memorised. */
    spiralWall: function (t, rng) {
      return {
        kind: 'wall', lane: 'spiral', size: 'm',
        dur: rng.range(4.0, 5.0), period: Math.max(0.6, 1.1 - t * 0.04),
        count: 17 + Math.min(9, Math.round(t)), gap: Math.max(44, 70 - t * 3),
        speed: 100 + t * 6, drift: 0, orbit: 1, seed: rng.int(1, 99999)
      };
    }
  };
  function makeMove(kind, tier, rng) {
    var f = MOVE_BUILD[kind] || MOVE_BUILD.aimed;
    return f(tier, rng);
  }

  function makeBoss(stageIdx, seed) {
    var st = stageAt(stageIdx);
    var def = bossDef(st.boss);
    var rng = rngObj(seed ^ (0x9E37 + stageIdx * 7919));
    var phases = [];
    for (var p = 0; p < def.hp.length; p++) {
      var grammar = def.moveGrammar[p] || def.moveGrammar[def.moveGrammar.length - 1] || ['aimed'];
      var moves = [];
      for (var m = 0; m < grammar.length; m++) {
        moves.push(makeMove(grammar[m], st.tier + p * 1.4, rng));
      }
      phases.push({
        hp: Math.round(def.hp[p]),
        pods: def.podRows[p] || 2,
        podHP: Math.round(def.podHP * (1 + p * 0.16)),
        podSpread: def.podSpread,
        moves: moves
      });
    }
    return {
      key: st.boss, art: def.art, name: def.name, title: def.title,
      phases: phases
    };
  }

  /* ---------------------------------------------------- enemy factory */
  function enemy(o) {
    return {
      x: o.x, y: o.y, tx: o.tx, ty: o.ty,
      speed: o.speed || 120, hold: o.hold == null ? 2.5 : o.hold,
      ovx: o.ovx || 0, ovy: o.ovy == null ? 130 : o.ovy,
      hp: o.hp, r: o.r || 13, kind: o.kind || 'drone',
      pat: o.pat || null, delay: o.delay || 0,
      score: o.score || 200, sway: o.sway || 0, drop: o.drop || null
    };
  }

  /* ---------------------------------------------------- wave builders */
  /* Each builder owns one grammar. Returned enemies are plain data; PlayScene
   * copies them into preallocated pool records and never keeps a reference. */
  var WAVE_BUILD = {
    aimed: function (t, rng, cast) {
      var list = [], n = 5, i;
      var dir = rng.chance(0.5) ? 1 : -1;
      for (i = 0; i < n; i++) {
        var x = 52 + i * ((BASE_W - 104) / (n - 1));
        list.push(enemy({
          x: x, y: -26 - i * 16, tx: x + dir * 26, ty: 124 + (i % 2) * 34,
          speed: 152, hold: 2.2, ovy: 178, ovx: dir * 32,
          hp: 7 + t * 2.4, r: 13, kind: 'drone', score: 180, delay: i * 0.16,
          pat: {
            kind: 'aimed', lane: 'aimed', size: 's',
            period: rng.range(0.95, 1.35), n: 1 + Math.min(4, Math.round(t * 0.5)),
            spread: 0.16, burst: 1, speed: 128 + t * 12
          }
        }));
      }
      return list;
    },
    fan: function (t, rng, cast) {
      var list = [], n = rng.int(2, 3), i;
      for (i = 0; i < n; i++) {
        var side = (i % 2 === 0) ? -1 : 1;
        var fx = side < 0 ? 80 + i * 22 : BASE_W - 80 - i * 22;
        list.push(enemy({
          x: side < 0 ? -32 : BASE_W + 32, y: 66 + i * 40,
          tx: fx, ty: 94 + i * 42, speed: 132, hold: 3.4,
          ovx: side * 92, ovy: 42, sway: 1,
          hp: 18 + t * 6, r: 16, kind: 'pod', score: 420, delay: i * 0.34,
          pat: {
            kind: 'fan', lane: 'fan', size: 'm',
            period: rng.range(1.3, 1.85), n: 6 + Math.min(9, Math.round(t * 0.9)),
            spread: 0.82 + t * 0.05, speed: 106 + t * 7
          }
        }));
      }
      return list;
    },
    spiral: function (t, rng, cast) {
      var list = [], n = t >= 3 && rng.chance(0.5) ? 2 : 1, i;
      for (i = 0; i < n; i++) {
        var sx = n === 1 ? BASE_W * 0.5 : (i === 0 ? BASE_W * 0.3 : BASE_W * 0.7);
        list.push(enemy({
          x: sx, y: -32, tx: sx, ty: 118, speed: 112, hold: 4.4, ovy: 122, sway: 1,
          hp: 28 + t * 9, r: 18, kind: 'orb', score: 720, delay: i * 0.5,
          pat: {
            kind: 'arms', lane: 'spiral', size: 's', period: 0.085,
            arms: 2 + (Math.round(t) % 3),
            rate: (rng.chance(0.5) ? 1 : -1) * (2.0 + t * 0.3),
            speed: 92 + t * 6
          }
        }));
      }
      for (i = 0; i < 2; i++) {
        var ex = i === 0 ? 46 : BASE_W - 46;
        list.push(enemy({
          x: ex, y: -22, tx: ex, ty: 196, speed: 152, hold: 1.6, ovy: 192,
          hp: 6 + t * 1.8, r: 12, kind: 'lancer', score: 150, delay: 0.9,
          pat: {
            kind: 'aimed', lane: 'aimed', size: 's', period: 1.25,
            n: 1 + Math.min(3, Math.round(t * 0.4)), spread: 0.1, burst: 1,
            speed: 140 + t * 10
          }
        }));
      }
      return list;
    },
    wall: function (t, rng, cast) {
      var list = [], n = 3, i;
      for (i = 0; i < n; i++) {
        var wx = 70 + i * ((BASE_W - 140) / (n - 1));
        list.push(enemy({
          x: wx, y: -28, tx: wx, ty: 72, speed: 122, hold: 3.8, ovy: 152,
          hp: 16 + t * 5.5, r: 15, kind: 'block', score: 400, delay: i * 0.48,
          pat: {
            kind: 'wall', lane: 'wall', size: 'm',
            period: rng.range(1.65, 2.15), count: 12 + Math.min(9, Math.round(t)),
            gap: Math.max(44, 66 - t * 2.6), speed: 100 + t * 6,
            drift: rng.range(-18, 18), seed: rng.int(1, 99999)
          }
        }));
      }
      return list;
    },
    ring: function (t, rng, cast) {
      var list = [], i;
      for (i = 0; i < 2; i++) {
        var rx = i === 0 ? BASE_W * 0.32 : BASE_W * 0.68;
        list.push(enemy({
          x: rx, y: -28, tx: rx, ty: 104 + i * 26, speed: 118, hold: 4.0, ovy: 134, sway: 1,
          hp: 24 + t * 7, r: 16, kind: 'pod', score: 560, delay: i * 0.42,
          pat: {
            kind: 'ring', lane: 'ring', size: 's',
            period: Math.max(0.42, 0.95 - t * 0.04), n: 8 + Math.min(12, Math.round(t)),
            spin: rng.range(0.1, 0.3) * (rng.chance(0.5) ? 1 : -1),
            speed: 94 + t * 6, aim: rng.chance(0.4)
          }
        }));
      }
      return list;
    },
    rain: function (t, rng, cast) {
      var list = [], i, n = 2;
      for (i = 0; i < n; i++) {
        var lx = 40 + i * (BASE_W - 80);
        list.push(enemy({
          x: lx, y: -24, tx: lx, ty: 60, speed: 140, hold: 4.4, ovy: 150,
          hp: 14 + t * 4, r: 13, kind: 'lancer', score: 340, delay: i * 0.3,
          pat: {
            kind: 'rain', lane: 'rain', size: 's',
            period: Math.max(0.07, 0.2 - t * 0.008), speed: 116 + t * 6,
            seed: rng.int(1, 99999)
          }
        }));
      }
      return list;
    },
    arms: function (t, rng, cast) {
      var list = [];
      list.push(enemy({
        x: BASE_W * 0.5, y: -34, tx: BASE_W * 0.5, ty: 110, speed: 104, hold: 5.0,
        ovy: 118, sway: 1, hp: 34 + t * 10, r: 19, kind: 'orb', score: 900,
        pat: {
          kind: 'arms', lane: 'arms', size: 's', period: 0.08,
          arms: 3 + (Math.round(t) % 3), rate: (2.2 + t * 0.22) * (rng.chance(0.5) ? 1 : -1),
          speed: 92 + t * 6, sweep: true
        }
      }));
      for (var i = 0; i < 3; i++) {
        var ex = 60 + i * ((BASE_W - 120) / 2);
        list.push(enemy({
          x: ex, y: -20 - i * 14, tx: ex, ty: 176, speed: 148, hold: 1.4, ovy: 186,
          hp: 8 + t * 2, r: 12, kind: 'lancer', score: 180, delay: 0.7 + i * 0.2,
          pat: {
            kind: 'aimed', lane: 'aimed', size: 's', period: 1.4,
            n: 1 + Math.min(2, Math.round(t * 0.3)), spread: 0.1, burst: 1,
            speed: 136 + t * 10
          }
        }));
      }
      return list;
    }
  };
  function buildWave(kind, tier, rng, cast) {
    var f = WAVE_BUILD[kind] || WAVE_BUILD.aimed;
    return f(tier, rng, cast || []);
  }

  /* ---------------------------------------------------------- drops */
  /* The owner always wants generous drops. Every wave pays out, and the
   * table leans hard on power and bomb so the run keeps escalating. */
  var DROP_TABLE = [
    { key: 'power', w: 34 },
    { key: 'bomb', w: 26 },
    { key: 'score', w: 24 },
    { key: 'shield', w: 12 },
    { key: 'extend', w: 4 }
  ];
  function rollDrop(rng) {
    var total = 0, i;
    for (i = 0; i < DROP_TABLE.length; i++) total += DROP_TABLE[i].w;
    var x = rng.r() * total;
    for (i = 0; i < DROP_TABLE.length; i++) {
      x -= DROP_TABLE[i].w;
      if (x <= 0) return DROP_TABLE[i].key;
    }
    return 'score';
  }

  /* ------------------------------------------------------ stage build */
  function makeStage(stageIdx, seed) {
    var st = stageAt(stageIdx);
    var rng = rngObj((seed >>> 0) ^ st.seed ^ (stageIdx * 2654435761));
    var waves = [], t = 1.8, i;
    var nW = st.waves;
    for (i = 0; i < nW; i++) {
      // Deliberate ramp: tier climbs across the stage, and every fourth wave
      // is the stage's signature grammar so the identity keeps reasserting.
      var ramp = st.tier + (i / Math.max(1, nW - 1)) * 2.4;
      var kind = (i === 0) ? st.grammar
        : (i % 4 === 3 ? st.grammar : rng.pick(st.mix) || st.grammar);
      var list = buildWave(kind, ramp, rng, st.cast);
      // Generous: 2 drops per wave, 3 on the signature waves.
      var drops = (i % 4 === 3) ? 3 : 2;
      for (var d = 0; d < drops && d < list.length; d++) {
        list[d].drop = rollDrop(rng);
      }
      waves.push({ t: t, kind: kind, list: list, gate: i === st.gateWave });
      t += Math.max(2.9, rng.range(4.4, 6.0) - st.tier * 0.22);
    }
    return {
      index: stageIdx, def: st, waves: waves,
      bossAt: t + (nW ? 2.2 : 1.2),
      boss: makeBoss(stageIdx, (seed >>> 0) ^ st.seed)
    };
  }

  /* ------------------------------------------------------- medals */
  var MEDAL_ORDER = ['none', 'bronze', 'silver', 'gold'];
  function medalRank(name) {
    var i = MEDAL_ORDER.indexOf(name);
    return i < 0 ? 0 : i;
  }
  function medalName(rank) {
    var r = rank | 0;
    if (!(r >= 0 && r < MEDAL_ORDER.length)) r = 0;
    return MEDAL_ORDER[r];
  }
  /* stats: { score, graze, bombsUsed } for THIS stage only. */
  function medalFor(stageIdx, stats) {
    var m = stageAt(stageIdx).medal;
    if (!stats) return 0;
    var sc = stats.score || 0, gz = stats.graze || 0, bu = stats.bombsUsed || 0;
    if (sc >= m.gold && gz >= m.goldGraze && bu === 0) return 3;
    if (sc >= m.silver && gz >= m.silverGraze) return 2;
    if (sc >= m.bronze) return 1;
    return 0;
  }
  function medalHint(stageIdx) {
    var m = stageAt(stageIdx).medal;
    return {
      bronze: 'Score ' + m.bronze.toLocaleString(),
      silver: 'Score ' + m.silver.toLocaleString() + ' and ' + m.silverGraze + ' graze',
      gold: 'Score ' + m.gold.toLocaleString() + ', ' + m.goldGraze + ' graze, no bomb'
    };
  }

  /* ------------------------------------------------------- unlocks */
  /* The chain: clear a run to open Boss Rush, collect medals to open the
   * fourth stage, then hold silver across all four to summon the finale. */
  function medalTotal(medals) {
    var n = 0;
    for (var i = 0; i < CAMPAIGN_COUNT; i++) if ((medals && medals[i]) > 0) n++;
    return n;
  }
  function unlocks(save) {
    var medals = (save && save.medals) || [];
    var silverAll = true;
    for (var i = 0; i < CAMPAIGN_COUNT; i++) if (!(medals[i] >= 2)) silverAll = false;
    return {
      bossRush: !!(save && save.cleared),
      ironMeridian: medalTotal(medals) >= 3,
      finale: silverAll,
      oneCC: !!(save && save.cleared)
    };
  }
  function unlockHint(save) {
    var u = unlocks(save);
    if (!u.bossRush) return 'Clear a Stage Run to open Boss Rush.';
    if (!u.ironMeridian) return 'Earn 3 stage medals to open IRON MERIDIAN.';
    if (!u.finale) return 'Hold silver on all four stages to summon SKYHAMMER PRIME.';
    return 'All routes open. The 1CC medal is the last one left.';
  }
  /* The stage list a Stage Run actually plays, given unlock state. */
  function runStages(save) {
    var u = unlocks(save);
    var list = [0, 1, 2];
    if (u.ironMeridian) list.push(3);
    if (u.finale) list.push(FINALE_INDEX);
    return list;
  }
  function bossRushStages(save) {
    var u = unlocks(save);
    var list = [0, 1, 2];
    if (u.ironMeridian) list.push(3);
    if (u.finale) list.push(FINALE_INDEX);
    return list;
  }

  /* ------------------------------------------------------ graze route */
  /* One discoverable bonus per stage. A pair of pylons drifts down leaving a
   * narrow lane; threading it while grazing pays a multiplier-scaled bonus
   * and a guaranteed drop. Nothing announces it beyond the pylons, so it
   * stays a route the player finds. */
  var GATE = {
    width: 74,          // gap between pylons, world px
    speed: 62,          // downward drift
    life: 7.0,          // seconds before it leaves play
    grazeWindow: 3.0,   // seconds of graze history that counts
    baseBonus: 4000,
    perGraze: 260,
    maxBonus: 60000
  };

  return {
    STAGES: STAGES, BOSSES: BOSSES, GATE: GATE, DROP_TABLE: DROP_TABLE,
    CAMPAIGN_COUNT: CAMPAIGN_COUNT, FINALE_INDEX: FINALE_INDEX,
    MEDAL_ORDER: MEDAL_ORDER,
    rngObj: rngObj, stageAt: stageAt, bossDef: bossDef,
    makeStage: makeStage, makeBoss: makeBoss, makeMove: makeMove,
    buildWave: buildWave, rollDrop: rollDrop,
    medalFor: medalFor, medalName: medalName, medalRank: medalRank,
    medalHint: medalHint, medalTotal: medalTotal,
    unlocks: unlocks, unlockHint: unlockHint,
    runStages: runStages, bossRushStages: bossRushStages
  };
})();
