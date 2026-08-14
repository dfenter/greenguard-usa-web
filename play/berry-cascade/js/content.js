/* Berry Cascade - authored content: trail segments, 30 groves, the Grove
 * Gauntlet, medal tiers, Endless Cascade tuning, and the save schema.
 * Every keyed lookup here has a guarded fallback: a missing segment or
 * gauntlet id must degrade, never freeze.
 */
(function (BC) {
  'use strict';

  /* ------------------------------------------------------- berry families
   * Triple coded: hue + silhouette + centre glyph. Never hue alone.
   * Order matters: colors 4 and 5 levels use the first 4 / 5 entries, so the
   * low-count sets must already differ in value and shape.
   */
  BC.FAMILIES = [
    { key: 'coral', face: 0xF25C68, edge: 0x8E2B36, name: 'Coral berry', shape: 'circle', glyph: 'seed' },
    { key: 'sun', face: 0xF7C948, edge: 0x9A7409, name: 'Sun berry', shape: 'rsquare', glyph: 'sun' },
    { key: 'leaf', face: 0x5BCB77, edge: 0x216B37, name: 'Leaf berry', shape: 'hex', glyph: 'leaf' },
    { key: 'tide', face: 0x38A8DE, edge: 0x11557A, name: 'Tide berry', shape: 'diamond', glyph: 'drop' },
    { key: 'plum', face: 0x9A7CF3, edge: 0x4B3399, name: 'Plum berry', shape: 'shield', glyph: 'star' },
    { key: 'ember', face: 0xF29A4A, edge: 0x8C4A0E, name: 'Ember berry', shape: 'octagon', glyph: 'flame' }
  ];
  BC.familyAt = function (c) {
    return BC.FAMILIES[c] || BC.FAMILIES[0];
  };

  BC.TOKENS = {
    ink: 0x182238, board: 0x243453, cell: 0x314567, cellEdge: 0x5D7294,
    highlight: 0xF7FBFF, syrup: 0xC97B2E, syrupDeep: 0x8A4C12, acorn: 0xA9713F,
    acornCap: 0x5E3A1C, prismA: 0xF7FBFF, prismB: 0x9A7CF3,
    good: 0x5BCB77, warn: 0xF7C948, bad: 0xF25C68
  };

  /* ------------------------------------------------------------ segments
   * Four authored trail identities plus the finale. Each owns a goal-combo
   * difficulty rule and a signature visual treatment.
   */
  BC.SEGMENTS = [
    {
      id: 'orchard', name: 'Opening Orchard', from: 0, to: 6,
      skyTop: 0x35507F, skyBot: 0x1B2740, frame: 0x8A6A46, frameLip: 0xC79B6B,
      cell: 0x2E4269, cellEdge: 0x5D7294, accent: 0xF7C948, motif: 'leaf',
      blurb: 'Wide rows, gentle goals, starter specials on the board.',
      colors: function (n) { return 5; },
      seedSpecials: 3, moveBonus: 9, scoreFactor: 0.44,
      goals: function (n, rand) {
        var g = { syrup: 0, syrupShape: 'none', acorns: 0, scoreMul: 1.0 };
        if (n >= 4) { g.syrup = 6 + (n - 4) * 2; g.syrupShape = 'patch'; }
        return g;
      }
    },
    {
      id: 'marsh', name: 'Syrup Marsh', from: 7, to: 14,
      skyTop: 0x3A4230, skyBot: 0x1A2226, frame: 0xB07A3C, frameLip: 0xE0B071,
      cell: 0x2C3A48, cellEdge: 0x63798C, accent: 0xF29A4A, motif: 'bubble',
      blurb: 'Sunk syrup beds. Cascade down into them, do not chase the top.',
      colors: function (n) { return 5; },
      seedSpecials: 2, moveBonus: 7, scoreFactor: 0.52,
      goals: function (n, rand) {
        var k = n - 7;
        var g = { syrup: 12 + k * 2, syrupShape: (k % 2 === 0) ? 'floor' : 'patch', acorns: 0, scoreMul: 0.95 };
        if (k >= 3 && k % 3 === 0) g.acorns = 1;
        if (k >= 5) g.syrupShape = 'twin';
        return g;
      }
    },
    {
      id: 'forest', name: 'Acorn Forest', from: 15, to: 21,
      skyTop: 0x244A41, skyBot: 0x12231F, frame: 0x6F4E32, frameLip: 0xA5794F,
      cell: 0x27403C, cellEdge: 0x5A8177, accent: 0x5BCB77, motif: 'spore',
      blurb: 'Acorns drop in from the canopy. Clear a lane and walk them down.',
      colors: function (n) { return n < 19 ? 5 : 6; },
      seedSpecials: 2, moveBonus: 6, scoreFactor: 0.58,
      goals: function (n, rand) {
        var k = n - 15;
        var g = { syrup: 0, syrupShape: 'none', acorns: 2 + Math.floor(k / 3), scoreMul: 1.0 };
        if (k % 2 === 1) { g.syrup = 8 + k; g.syrupShape = 'columns'; }
        return g;
      }
    },
    {
      id: 'lantern', name: 'Lantern Thicket', from: 22, to: 27,
      skyTop: 0x3A2F63, skyBot: 0x161231, frame: 0xC79B45, frameLip: 0xF0D089,
      cell: 0x2F2A55, cellEdge: 0x6F65A6, accent: 0x9A7CF3, motif: 'ember',
      blurb: 'Six berry families, mixed goals, and syrup where you want to swap.',
      colors: function (n) { return 6; },
      seedSpecials: 2, moveBonus: 6, scoreFactor: 0.64,
      goals: function (n, rand) {
        var k = n - 22;
        return {
          syrup: 14 + k * 2, syrupShape: (k % 2 === 0) ? 'checker' : 'ring',
          acorns: 2 + Math.floor(k / 3), scoreMul: 1.05
        };
      }
    },
    {
      id: 'summit', name: 'Berry Cascade Summit', from: 28, to: 29,
      skyTop: 0x5A3A6E, skyBot: 0x1D1638, frame: 0xE0B85E, frameLip: 0xFFF0BE,
      cell: 0x3A2B58, cellEdge: 0x8C74B8, accent: 0xF25C68, motif: 'petal',
      blurb: 'Every goal at once. The trail crown is on the far side.',
      colors: function (n) { return 6; },
      seedSpecials: 3, moveBonus: 8, scoreFactor: 0.70,
      goals: function (n, rand) {
        var k = n - 28;
        return {
          syrup: 26 + k * 8, syrupShape: k === 0 ? 'ring' : 'flood',
          acorns: 3 + k, scoreMul: 1.15
        };
      }
    }
  ];

  BC.segmentFor = function (n) {
    var s = BC.SEGMENTS;
    for (var i = 0; i < s.length; i++) if (n >= s[i].from && n <= s[i].to) return s[i];
    return s[0];                                   /* guarded fallback */
  };
  BC.segmentById = function (id) {
    var s = BC.SEGMENTS;
    for (var i = 0; i < s.length; i++) if (s[i].id === id) return s[i];
    return s[0];                                   /* guarded fallback */
  };

  BC.GROVE_COUNT = 30;

  BC.GROVE_NAMES = [
    'Dew Hollow', 'Sunny Bramble', 'Amber Steps', 'Ribbon Creek', 'Thistle Bend',
    'Copper Grove', 'Quiet Orchard',
    'Moss Gate', 'Syrup Flats', 'Hazel Rise', 'Lantern Wood', 'Glass Pond',
    'Rook Meadow', 'Cider Pass', 'Warm Hollow',
    'Bracken Mile', 'Fern Terrace', 'Acorn Vault', 'Nettle Climb', 'Hollow Oak',
    'Squirrel Run', 'Canopy Steps',
    'Ember Ridge', 'Frost Bramble', 'Sable Marsh', 'Gilded Rows', 'Cloud Orchard',
    'Sunset Bluff',
    'Storm Arbor', 'Cascade Peak'
  ];
  BC.groveName = function (n) { return BC.GROVE_NAMES[n] || ('Grove ' + (n + 1)); };

  /* ------------------------------------------------- syrup bed authoring */
  function syrupCells(shape, count, rand, deep) {
    var W = BC.W, H = BC.H, out = [], seen = {}, x, y, i;
    function push(idx, layers) {
      if (idx < 0 || idx >= W * H || seen[idx]) return;
      seen[idx] = 1; out.push({ i: idx, l: layers });
    }
    var layers = deep ? 2 : 1;
    if (shape === 'floor') {
      var rows = Math.max(1, Math.ceil(count / (W * layers)));
      for (y = H - rows; y < H && out.length * layers < count; y++)
        for (x = 0; x < W && out.length * layers < count; x++) push(y * W + x, layers);
    } else if (shape === 'columns') {
      var cols = Math.max(2, Math.min(W, Math.ceil(count / (H * layers))) + 1);
      for (var c = 0; c < cols && out.length * layers < count; c++) {
        x = ((c * 3 + 1) % W);
        for (y = H - 1; y >= 2 && out.length * layers < count; y--) push(y * W + x, layers);
      }
    } else if (shape === 'checker') {
      for (y = 1; y < H && out.length * layers < count; y++)
        for (x = (y % 2); x < W && out.length * layers < count; x += 2) push(y * W + x, layers);
    } else if (shape === 'ring') {
      for (x = 1; x < W - 1; x++) { push(1 * W + x, layers); push((H - 2) * W + x, layers); }
      for (y = 1; y < H - 1; y++) { push(y * W + 1, layers); push(y * W + (W - 2), layers); }
    } else if (shape === 'twin') {
      var bx = [1, W - 4], by = [H - 4, 2];
      for (var b = 0; b < 2; b++)
        for (y = by[b]; y < by[b] + 3; y++)
          for (x = bx[b]; x < bx[b] + 3; x++) push(y * W + x, layers);
    } else if (shape === 'flood') {
      for (y = 1; y < H; y++) for (x = 0; x < W; x++) {
        if (y >= 3 && y <= 4 && x >= 3 && x <= 4) continue;
        push(y * W + x, layers);
      }
    } else {                                        /* 'patch' + fallback */
      var bw = BC.clamp(Math.ceil(Math.sqrt(count * 1.5)), 3, W);
      var bh = BC.clamp(Math.ceil(count / Math.max(1, bw * layers)), 1, H - 1);
      var x0 = (rand() * (W - bw + 1)) | 0;
      var y0 = BC.clamp(2 + ((rand() * Math.max(1, H - bh - 2)) | 0), 1, H - bh);
      for (y = y0; y < y0 + bh && out.length * layers < count; y++)
        for (x = x0; x < x0 + bw && out.length * layers < count; x++) push(y * W + x, layers);
    }
    /* ring, twin and flood are drawn as whole figures, so trim them back to
     * the authored count: the number in the segment table is the goal the
     * player sees, and it has to mean something. */
    var sum = 0, trimmed = [];
    for (i = 0; i < out.length; i++) {
      if (sum >= count) break;
      var lay = Math.min(out[i].l, count - sum);
      trimmed.push({ i: out[i].i, l: lay });
      sum += lay;
    }
    return trimmed;
  }

  /* --------------------------------------------------------- grove build */
  var GROVE_CACHE = {};

  BC.buildGrove = function (n) {
    if (GROVE_CACHE[n]) return GROVE_CACHE[n];
    n = BC.clamp(n | 0, 0, BC.GROVE_COUNT - 1);
    var seg = BC.segmentFor(n);
    var seed = 0x51ED + n * 7919 + 13;
    var rand = BC.rng(seed);
    var g = seg.goals(n, rand);
    var deep = (n >= 22);
    var cells = g.syrup > 0 ? syrupCells(g.syrupShape, g.syrup, rand, deep) : [];
    var total = 0;
    for (var k = 0; k < cells.length; k++) total += cells[k].l;

    var lv = {
      n: n, mode: 'trail', seg: seg.id, seed: seed,
      name: BC.groveName(n),
      colors: seg.colors(n),
      target: 0,
      syrupCells: cells, syrupTotal: total,
      acorns: g.acorns,
      seedSpecials: seg.seedSpecials,
      moves: 18 + seg.moveBonus + Math.floor(n / 7) * 2
    };

    /* 1. find a budget that clears the AUTHORED goals (syrup, acorns) */
    BC.validate(lv, {
      headroom: 6 + Math.round(seg.moveBonus * 0.4),
      maxMoves: 40, minTargetFactor: 1.0, tries: 5, need: 2
    });

    /* 2. measure what that budget is actually worth in points, and set the
     *    score goal as a fraction of it. A fixed number cannot know that an
     *    early board with three starter specials pays out in one swipe. */
    var run = BC.medianScoreRun(lv, seed ^ 0x5EED, 3);
    var factor = seg.scoreFactor * (g.scoreMul || 1);
    lv.target = Math.max(1200, Math.round(run * factor / 50) * 50);
    lv.parScore = run;

    /* 3. confirm the full goal set is still clearable, easing the score goal
     *    rather than the authored syrup and acorn counts if it is not */
    var ok = false, relax;
    for (relax = 0; relax < 7; relax++) {
      var pass = 0;
      for (var t2 = 0; t2 < 4; t2++) {
        if (BC.playout(lv, 0x3C1D + n * 811 + relax * 97 + t2 * 17)) pass++;
        if (pass >= 2) break;
      }
      if (pass >= 2) { ok = true; break; }
      if (lv.moves < 46) lv.moves += 3;
      lv.target = Math.max(900, Math.round(lv.target * 0.90 / 50) * 50);
    }
    lv.confirmed = ok;
    lv.stars = [lv.target, Math.round(lv.target * 1.35), Math.round(lv.target * 1.7)];
    GROVE_CACHE[n] = lv;
    return lv;
  };

  /* ------------------------------------------------------ grove gauntlet
   * Hand-authored hardest-goal levels with an unlock chain. Not generated:
   * the shapes and counts below are the whole point of the mode.
   */
  BC.GAUNTLET = [
    {
      id: 'g0', name: 'Bramble Lock', seg: 'orchard', colors: 5, moves: 30,
      scoreFactor: 0.70, syrupShape: 'floor', syrup: 32, deep: true, acorns: 0, seedSpecials: 2,
      needTrail: 5, needPoints: 0,
      blurb: 'Two locked floor rows. Only cascades reach the second layer.'
    },
    {
      id: 'g1', name: 'Acorn Run', seg: 'forest', colors: 5, moves: 30,
      scoreFactor: 0.72, syrupShape: 'none', syrup: 0, deep: false, acorns: 5, seedSpecials: 2,
      needTrail: 8, needPoints: 3,
      blurb: 'Five acorns, no syrup. Keep the floor open or they stall.'
    },
    {
      id: 'g2', name: 'Checker Marsh', seg: 'marsh', colors: 6, moves: 32,
      scoreFactor: 0.75, syrupShape: 'checker', syrup: 28, deep: false, acorns: 2, seedSpecials: 2,
      needTrail: 12, needPoints: 8,
      blurb: 'Syrup on every other cell, so every match pays twice.'
    },
    {
      id: 'g3', name: 'Twin Vaults', seg: 'lantern', colors: 6, moves: 34,
      scoreFactor: 0.78, syrupShape: 'twin', syrup: 36, deep: true, acorns: 3, seedSpecials: 2,
      needTrail: 16, needPoints: 14,
      blurb: 'Two double-layer vaults on opposite corners of the board.'
    },
    {
      id: 'g4', name: 'Crown Ring', seg: 'summit', colors: 6, moves: 34,
      scoreFactor: 0.80, syrupShape: 'ring', syrup: 28, deep: false, acorns: 3, seedSpecials: 3,
      needTrail: 22, needPoints: 21,
      blurb: 'A ring of syrup with acorns falling through the middle.'
    },
    {
      id: 'g5', name: 'Cascade Crucible', seg: 'summit', colors: 6, moves: 38,
      scoreFactor: 0.82, syrupShape: 'flood', syrup: 42, deep: false, acorns: 4, seedSpecials: 3,
      needTrail: 28, needPoints: 30,
      blurb: 'Syrup nearly everywhere, and four acorns to walk out.'
    }
  ];

  var GAUNTLET_CACHE = {};

  BC.buildGauntlet = function (gi) {
    gi = BC.clamp(gi | 0, 0, BC.GAUNTLET.length - 1);
    if (GAUNTLET_CACHE[gi]) return GAUNTLET_CACHE[gi];
    var d = BC.GAUNTLET[gi];
    var seed = 0x9E37 + gi * 4211;
    var rand = BC.rng(seed);
    var cells = d.syrup > 0 ? syrupCells(d.syrupShape, d.syrup, rand, d.deep) : [];
    var total = 0;
    for (var k = 0; k < cells.length; k++) total += cells[k].l;
    var lv = {
      n: 100 + gi, gi: gi, mode: 'gauntlet', seg: d.seg, seed: seed, name: d.name,
      colors: d.colors, target: 0,
      syrupCells: cells, syrupTotal: total, acorns: d.acorns,
      seedSpecials: d.seedSpecials, moves: d.moves
    };
    /* authored syrup and acorn counts are never relaxed here: the goal mix
     * IS the level. Only the budget moves, and only if the bot needs it. */
    BC.validate(lv, { headroom: 3, maxMoves: d.moves + 22, minTargetFactor: 1.0, tries: 5, need: 2 });
    var run = BC.medianScoreRun(lv, seed ^ 0x5EED, 3);
    lv.target = Math.max(2000, Math.round(run * d.scoreFactor / 50) * 50);
    lv.parScore = run;
    var ok = false;
    for (var relax = 0; relax < 7; relax++) {
      var pass = 0;
      for (var t2 = 0; t2 < 4; t2++) {
        if (BC.playout(lv, 0x77A1 + gi * 613 + relax * 41 + t2 * 13)) pass++;
        if (pass >= 2) break;
      }
      if (pass >= 2) { ok = true; break; }
      if (lv.moves < d.moves + 28) lv.moves += 4;
      lv.target = Math.max(1500, Math.round(lv.target * 0.92 / 50) * 50);
    }
    lv.confirmed = ok;
    lv.stars = [lv.target, Math.round(lv.target * 1.25), Math.round(lv.target * 1.5)];
    GAUNTLET_CACHE[gi] = lv;
    return lv;
  };

  BC.gauntletUnlocked = function (gi, save) {
    var d = BC.GAUNTLET[gi];
    if (!d) return false;
    if (gi > 0 && !(save.gMedals[gi - 1] > 0)) return false;
    return BC.trailCleared(save) >= d.needTrail && BC.medalPoints(save) >= d.needPoints;
  };

  /* --------------------------------------------------------- endless mode */
  BC.endlessStage = function (score) {
    return BC.clamp(Math.floor(score / 6500), 0, 9);
  };
  BC.buildEndless = function (stage, seedSalt) {
    var s = BC.clamp(stage | 0, 0, 9);
    return {
      n: 200 + s, mode: 'endless', seg: s < 3 ? 'orchard' : (s < 6 ? 'marsh' : 'summit'),
      seed: ((seedSalt | 0) ^ 0x9E3779B1 ^ (s * 7919)) >>> 0,
      name: 'Endless Cascade',
      colors: s < 4 ? 5 : 6,
      target: 0, syrupCells: [], syrupTotal: 0, acorns: 0,
      seedSpecials: s < 2 ? 2 : 1,
      moves: 22, stars: [0, 0, 0], validatedMoves: 22
    };
  };
  /* moves handed back when a stage is reached; shrinks as the board heats up */
  BC.endlessRefill = function (stage) {
    return Math.max(5, 10 - BC.clamp(stage | 0, 0, 9));
  };

  /* ------------------------------------------------------------- medals */
  BC.MEDALS = ['none', 'bronze', 'silver', 'gold'];
  BC.MEDAL_COLOR = [0x5D7294, 0xC98A4B, 0xC9D4E4, 0xF2C74B];

  BC.starsFor = function (lv, st) {
    var s = 0, t = lv.stars || [lv.target, lv.target * 2, lv.target * 3];
    for (var i = 0; i < 3; i++) if (st.score >= t[i]) s = i + 1;
    return s;
  };

  /* bronze = cleared, silver/gold add move efficiency and combo count */
  BC.medalFor = function (lv, st, cleared) {
    if (!cleared) return 0;
    var stars = BC.starsFor(lv, st);
    var left = lv.moves > 0 ? st.moves / lv.moves : 0;
    var eff = left >= 0.30 ? 2 : (left >= 0.12 ? 1 : 0);
    var combo = st.combos >= 4 ? 2 : (st.combos >= 2 ? 1 : 0);
    var pts = stars + eff + combo;
    if (pts >= 6) return 3;
    if (pts >= 4) return 2;
    return 1;
  };
  BC.medalBreakdown = function (lv, st, cleared) {
    var stars = cleared ? BC.starsFor(lv, st) : 0;
    var left = lv.moves > 0 ? st.moves / lv.moves : 0;
    return {
      stars: stars,
      eff: left >= 0.30 ? 2 : (left >= 0.12 ? 1 : 0),
      effPct: Math.round(left * 100),
      combo: st.combos >= 4 ? 2 : (st.combos >= 2 ? 1 : 0),
      combos: st.combos,
      medal: BC.medalFor(lv, st, cleared)
    };
  };

  BC.medalPoints = function (save) {
    var p = 0, i;
    for (i = 0; i < save.medals.length; i++) p += save.medals[i] | 0;
    for (i = 0; i < save.gMedals.length; i++) p += (save.gMedals[i] | 0) * 2;
    return p;
  };
  BC.trailCleared = function (save) {
    var c = 0;
    for (var i = 0; i < save.stars.length; i++) if (save.stars[i] > 0) c++;
    return c;
  };
  BC.totalStars = function (save) {
    var s = 0;
    for (var i = 0; i < save.stars.length; i++) s += save.stars[i] | 0;
    return s;
  };

  /* Three authored terrace restorations arrive with chapter rewards. The
   * first two close the orchard and marsh chapters; the last is the crown
   * reward at the far side of the trail. */
  BC.gardenStage = function (cleared) {
    cleared = cleared | 0;
    return cleared >= BC.GROVE_COUNT ? 3 : (cleared >= 15 ? 2 : (cleared >= 7 ? 1 : 0));
  };

  /* ---------------------------------------------------------- save shape */
  BC.SAVE_VERSION = 4;

  BC.defaultSave = function () {
    var i, s = {
      v: BC.SAVE_VERSION, stars: [], best: [], medals: [],
      gStars: [], gBest: [], gMedals: [],
      endless: 0, endlessStage: 0, unlocked: 1, crown: 0, garden: 0,
      tut: 0, seenGauntlet: 0, hints: 1
    };
    for (i = 0; i < BC.GROVE_COUNT; i++) { s.stars[i] = 0; s.best[i] = 0; s.medals[i] = 0; }
    for (i = 0; i < BC.GAUNTLET.length; i++) { s.gStars[i] = 0; s.gBest[i] = 0; s.gMedals[i] = 0; }
    return s;
  };

  /* Repairs anything shaped wrong rather than throwing it away. */
  BC.normalizeSave = function (o) {
    var d = BC.defaultSave();
    if (!o || typeof o !== 'object' || Array.isArray(o)) return d;
    function num(v, lo, hi) {
      var x = Number(v);
      return (isFinite(x) && x >= lo) ? BC.clamp(Math.floor(x), lo, hi) : lo;
    }
    function arr(src, len, hi) {
      var out = [], i;
      for (i = 0; i < len; i++) out[i] = num(Array.isArray(src) ? src[i] : 0, 0, hi);
      return out;
    }
    d.stars = arr(o.stars, BC.GROVE_COUNT, 3);
    d.best = arr(o.best, BC.GROVE_COUNT, 99999999);
    d.medals = arr(o.medals, BC.GROVE_COUNT, 3);
    d.gStars = arr(o.gStars, BC.GAUNTLET.length, 3);
    d.gBest = arr(o.gBest, BC.GAUNTLET.length, 99999999);
    d.gMedals = arr(o.gMedals, BC.GAUNTLET.length, 3);
    d.endless = num(o.endless, 0, 99999999);
    d.endlessStage = num(o.endlessStage, 0, 9);
    d.unlocked = BC.clamp(num(o.unlocked, 1, BC.GROVE_COUNT) || 1, 1, BC.GROVE_COUNT);
    d.crown = num(o.crown, 0, 1);
    d.garden = num(o.garden, 0, 3);
    d.tut = num(o.tut, 0, 8);
    d.seenGauntlet = num(o.seenGauntlet, 0, 1);
    d.hints = (o.hints === 0 || o.hints === false) ? 0 : 1;
    /* Cross-field repairs keep rewards attached to a real clear. */
    var cleared = 0, maxUnlocked = 1;
    for (var i = 0; i < BC.GROVE_COUNT; i++) {
      if (d.stars[i] > 0) {
        cleared++;
        maxUnlocked = Math.max(maxUnlocked, i + 2);
      } else {
        d.best[i] = 0;
        d.medals[i] = 0;
      }
    }
    for (i = 0; i < BC.GAUNTLET.length; i++) {
      if (d.gStars[i] <= 0) {
        d.gBest[i] = 0;
        d.gMedals[i] = 0;
      }
    }
    d.unlocked = BC.clamp(Math.min(d.unlocked, maxUnlocked), 1, BC.GROVE_COUNT);
    d.crown = cleared >= BC.GROVE_COUNT ? 1 : 0;
    d.garden = BC.gardenStage(cleared);
    d.endlessStage = Math.min(d.endlessStage, BC.endlessStage(d.endless));
    d.v = BC.SAVE_VERSION;
    return d;
  };

  BC.validateSave = function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); };
})(BC);
