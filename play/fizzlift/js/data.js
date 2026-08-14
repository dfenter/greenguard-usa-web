/* Fizzlift - content tables.
 * Piece families (triple coded: silhouette + value + glyph), the four authored
 * vats, the 20-level Fizzlift ladder, the 8 hand-authored Seal Rush levels,
 * the Endless Fizz generator, and the medal rules.
 * Every keyed lookup in this file has a guarded fallback: a missing variant
 * must degrade, never hard-freeze.
 */
(function (FZ) {
  'use strict';

  /* ------------------------------------------------------- families */
  /* Six soda families. Never hue alone: each carries a distinct silhouette,
     a distinct luminance step, and a distinct centred glyph that survives
     grayscale and all three colour-vision simulations. */
  FZ.FAMILIES = [
    { key: 'cherry', name: 'Cherry',  face: 0xF25C68, edge: 0x8E2531, lum: 0.52, shape: 'circle',  glyph: 'seed' },
    { key: 'citrus', name: 'Citrus',  face: 0xF7C948, edge: 0x8A6408, lum: 0.80, shape: 'hex',     glyph: 'burst' },
    { key: 'lime',   name: 'Lime',    face: 0x5BCB77, edge: 0x1B6B36, lum: 0.71, shape: 'clip',    glyph: 'leaf' },
    { key: 'tide',   name: 'Tide',    face: 0x38A8DE, edge: 0x10486B, lum: 0.61, shape: 'shield',  glyph: 'drop' },
    { key: 'grape',  name: 'Grape',   face: 0x9A7CF3, edge: 0x3F2790, lum: 0.55, shape: 'diamond', glyph: 'star' },
    { key: 'ginger', name: 'Ginger',  face: 0xF29A4A, edge: 0x8A480C, lum: 0.68, shape: 'octagon', glyph: 'flame' }
  ];
  FZ.family = function (i) {
    var f = FZ.FAMILIES[i | 0];
    return f || FZ.FAMILIES[0];
  };

  /* Shared board tokens (puzzlepop bible values). */
  FZ.TOK = {
    ink: 0x182238,
    board: 0x243453,
    cell: 0x314567,
    cellEdge: 0x5D7294,
    hi: 0xF7FBFF,
    cap: 0xE8EFF7,
    capEdge: 0x6E8199,
    seal: 0xB9C6D8,
    sealEdge: 0x3B4A61,
    sealHot: 0xF7C948
  };

  /* ----------------------------------------------------------- vats */
  /* Four authored bottle/vat identities. Each owns a backdrop, a frame
     material, a fizz colour, a bubble density and a line-behaviour bias, so a
     player can name the vat from a single frame. */
  FZ.VATS = [
    {
      id: 0, key: 'sunfizz', name: 'Sunfizz Vat', sub: 'Starter soda vat',
      bgTop: 0x1E1524, bgBot: 0x3A2416, glass: 0x4A3320,
      frame: 0xC98A34, frameDark: 0x6E4611, frameHi: 0xF3C877,
      fizz: 0xF7C948, fizzDeep: 0x8A5F0C, foam: 0xFFF0C2,
      bubbles: 16, bubbleRise: 26, treatment: 'ribs',
      accent: 0xF7C948
    },
    {
      id: 1, key: 'deepfizz', name: 'Deepfizz Tank', sub: 'Pressure tank, deep line',
      bgTop: 0x080F26, bgBot: 0x142452, glass: 0x1B2C57,
      frame: 0x5C7BA8, frameDark: 0x1E2B44, frameHi: 0x9FBBDD,
      fizz: 0x38A8DE, fizzDeep: 0x0C3E5E, foam: 0xD6F0FF,
      bubbles: 22, bubbleRise: 34, treatment: 'rivets',
      accent: 0x38A8DE
    },
    {
      id: 2, key: 'waveline', name: 'Waveline Reservoir', sub: 'The line never sits still',
      bgTop: 0x04201C, bgBot: 0x0C3A34, glass: 0x11483F,
      frame: 0x2FA089, frameDark: 0x0E4B40, frameHi: 0x7FDCC6,
      fizz: 0x5BCB77, fizzDeep: 0x14603A, foam: 0xD8FFE6,
      bubbles: 26, bubbleRise: 42, treatment: 'waves',
      accent: 0x5BCB77
    },
    {
      id: 3, key: 'overflow', name: 'Fizzlift Overflow', sub: 'Fastest rising line',
      bgTop: 0x20061C, bgBot: 0x430A33, glass: 0x4C0F3A,
      frame: 0x9A7CF3, frameDark: 0x3D2483, frameHi: 0xCFC0FF,
      fizz: 0xF25C68, fizzDeep: 0x76141F, foam: 0xFFD9DE,
      bubbles: 32, bubbleRise: 54, treatment: 'overflow',
      accent: 0xF25C68
    }
  ];
  FZ.vat = function (i) {
    var v = FZ.VATS[i | 0];
    return v || FZ.VATS[0];
  };

  /* ------------------------------------------- fizz line base profiles */
  /* boundary pattern -> row index per column (1..ROWS-1) */
  FZ.bndPattern = function (bp, c, cols, rows) {
    var m = (cols - 1) / 2, h = rows;
    switch (bp | 0) {
      case 0: return Math.round(h * 0.45);                                  // flat pour
      case 1: return Math.round(h * 0.25 + (c / (cols - 1)) * h * 0.45);    // tilted glass
      case 2: return Math.round(h * 0.68 - Math.abs(c - m) * (h * 0.10));   // fizz bowl
      case 3: return Math.round(h * 0.25 + Math.abs(c - m) * (h * 0.11));   // domed head
      case 4: return Math.round(h * 0.46 + Math.sin(c * 1.05) * h * 0.20);  // rolling wave
      case 5: return Math.round(h * 0.30 + (c % 2) * h * 0.34);             // comb split
      case 6: return Math.round(h * 0.70 - (c / (cols - 1)) * h * 0.48);    // backwash
      case 7: return Math.round(h * 0.34 + Math.abs(Math.sin(c * 0.7)) * h * 0.30); // swell
      default: return Math.round(h * 0.5);
    }
  };
  FZ.PATTERN_NAMES = ['Flat pour', 'Tilted glass', 'Fizz bowl', 'Domed head',
    'Rolling wave', 'Comb split', 'Backwash', 'Swell'];
  FZ.patternName = function (bp) { return FZ.PATTERN_NAMES[bp | 0] || 'Flat pour'; };

  /* --------------------------------------------------- the 20 levels */
  /* moves budgets are deliberately generous: the owner wants headroom, and
     every surfaced cap pays moves BACK on top of the budget (see refund). */
  FZ.LEVELS = [
    /* Vat 1 - Sunfizz Vat: calm lines, learn float vs fall */
    { vat: 0, seed: 1101, colors: 4, moves: 30, caps: 7,  seals: 0, bp: 0, wave: 0, every: 0, refund: 1, name: 'First Pour' },
    { vat: 0, seed: 1202, colors: 4, moves: 30, caps: 8,  seals: 1, bp: 0, wave: 0, every: 0, refund: 1, name: 'Cap Float' },
    { vat: 0, seed: 1303, colors: 4, moves: 32, caps: 9,  seals: 2, bp: 1, wave: 0, every: 0, refund: 1, name: 'Tilted Glass' },
    { vat: 0, seed: 1404, colors: 5, moves: 32, caps: 9,  seals: 2, bp: 2, wave: 1, every: 6, refund: 1, name: 'Fizz Bowl' },
    { vat: 0, seed: 1505, colors: 5, moves: 34, caps: 10,  seals: 3, bp: 1, wave: 1, every: 5, refund: 1, name: 'Sunfizz Surge' },
    /* Vat 2 - Deepfizz Tank: a deep line, most of the board floats upward */
    { vat: 1, seed: 1606, colors: 5, moves: 38, caps: 10,  seals: 3, bp: 3, wave: 1, every: 5, refund: 1, name: 'Down the Tank' },
    { vat: 1, seed: 1707, colors: 5, moves: 40, caps: 11,  seals: 3, bp: 2, wave: 1, every: 5, refund: 1, name: 'Pressure Head' },
    { vat: 1, seed: 1808, colors: 5, moves: 40, caps: 11, seals: 4, bp: 6, wave: 1, every: 4, refund: 1, name: 'Backwash' },
    { vat: 1, seed: 1909, colors: 6, moves: 42, caps: 12, seals: 4, bp: 3, wave: 2, every: 4, refund: 1, name: 'Domed Head' },
    { vat: 1, seed: 2010, colors: 6, moves: 42, caps: 12, seals: 5, bp: 2, wave: 2, every: 4, refund: 1, name: 'Deep Seal' },
    /* Vat 3 - Waveline Reservoir: the line travels every few moves */
    { vat: 2, seed: 2111, colors: 6, moves: 44, caps: 13, seals: 4, bp: 4, wave: 2, every: 4, refund: 1, name: 'Rolling Wave' },
    { vat: 2, seed: 2212, colors: 6, moves: 44, caps: 13, seals: 5, bp: 4, wave: 3, every: 3, refund: 1, name: 'Swell Line' },
    { vat: 2, seed: 2313, colors: 6, moves: 46, caps: 14, seals: 5, bp: 5, wave: 3, every: 3, refund: 1, name: 'Comb Split' },
    { vat: 2, seed: 2414, colors: 6, moves: 46, caps: 14, seals: 6, bp: 7, wave: 3, every: 3, refund: 1, name: 'Crosswave' },
    { vat: 2, seed: 2515, colors: 6, moves: 48, caps: 15, seals: 6, bp: 5, wave: 3, every: 3, refund: 1, name: 'Reservoir Break' },
    /* Vat 4 - Fizzlift Overflow: fastest rise, densest seals */
    { vat: 3, seed: 2616, colors: 6, moves: 48, caps: 15, seals: 6, bp: 0, wave: 2, every: 3, refund: 2, name: 'Overflow Gate' },
    { vat: 3, seed: 2717, colors: 6, moves: 50, caps: 16, seals: 7, bp: 6, wave: 3, every: 3, refund: 2, name: 'Rising Head' },
    { vat: 3, seed: 2818, colors: 6, moves: 50, caps: 16, seals: 7, bp: 1, wave: 3, every: 2, refund: 2, name: 'Valve Storm' },
    { vat: 3, seed: 2919, colors: 6, moves: 52, caps: 17, seals: 8, bp: 2, wave: 3, every: 2, refund: 2, name: 'Last Bowl' },
    { vat: 3, seed: 3020, colors: 6, moves: 54, caps: 17, seals: 8, bp: 4, wave: 3, every: 2, refund: 2, name: 'Fizzlift' }
  ];

  /* --------------------------------------------------- Seal Rush mode */
  /* Hand-authored dense-seal levels. Seals are the whole goal here: caps are a
     light secondary target and every cracked seal refunds moves. */
  FZ.RUSH = [
    { vat: 0, seed: 5101, colors: 4, moves: 34, caps: 2, seals: 6,  bp: 0, wave: 0, every: 0, refund: 2, sealRefund: 2, name: 'Six Seals' },
    { vat: 0, seed: 5202, colors: 5, moves: 34, caps: 3, seals: 7,  bp: 2, wave: 1, every: 5, refund: 2, sealRefund: 2, name: 'Bowl Cluster' },
    { vat: 1, seed: 5303, colors: 5, moves: 36, caps: 3, seals: 8,  bp: 3, wave: 1, every: 4, refund: 2, sealRefund: 2, name: 'Tank Manifold' },
    { vat: 1, seed: 5404, colors: 5, moves: 36, caps: 3, seals: 9,  bp: 6, wave: 2, every: 4, refund: 2, sealRefund: 2, name: 'Nine Valves' },
    { vat: 2, seed: 5505, colors: 6, moves: 38, caps: 4, seals: 9,  bp: 4, wave: 3, every: 3, refund: 2, sealRefund: 2, name: 'Wave Manifold' },
    { vat: 2, seed: 5606, colors: 6, moves: 38, caps: 4, seals: 10, bp: 5, wave: 3, every: 3, refund: 2, sealRefund: 2, name: 'Split Pressure' },
    { vat: 3, seed: 5707, colors: 6, moves: 40, caps: 4, seals: 11, bp: 7, wave: 3, every: 3, refund: 2, sealRefund: 3, name: 'Overflow Bank' },
    { vat: 3, seed: 5808, colors: 6, moves: 44, caps: 5, seals: 12, bp: 4, wave: 3, every: 2, refund: 2, sealRefund: 3, name: 'Full Manifold' }
  ];

  /* Unlock chain: the first Seal Rush level opens once the ladder has paid out
     a few medals, then each rush level opens the next. */
  FZ.RUSH_OPEN_MEDALS = 3;
  FZ.rushUnlocked = function (i, save) {
    if (i <= 0) return FZ.totalMedals(save) >= FZ.RUSH_OPEN_MEDALS;
    var prev = save && save.rush ? save.rush[String(i - 1)] : 0;
    return (prev | 0) > 0;
  };
  FZ.rushLockText = function (i, save) {
    if (i <= 0) {
      var have = FZ.totalMedals(save);
      return 'Earn ' + Math.max(0, FZ.RUSH_OPEN_MEDALS - have) + ' more medals';
    }
    var prev = FZ.RUSH[i - 1];
    return 'Clear ' + (prev ? prev.name : 'the previous rush');
  };

  /* ------------------------------------------------------- Endless */
  FZ.endlessCfg = function (round) {
    var r = FZ.clamp(round | 0, 0, 999);
    var vat = FZ.vat(r % FZ.VATS.length);
    return {
      vat: vat.id,
      seed: 90001 + r * 7717,
      colors: r < 2 ? 5 : 6,
      moves: r === 0 ? 26 : 22,
      caps: 9999,
      seals: Math.min(6, 1 + ((r / 2) | 0)),
      bp: r % 8,
      wave: Math.min(3, 1 + ((r / 3) | 0)),
      every: r < 3 ? 4 : (r < 8 ? 3 : 2),
      refund: 2,          /* every surfaced cap pays back 2 moves */
      sealRefund: 1,
      endless: true,
      name: 'Round ' + (r + 1)
    };
  };

  /* --------------------------------------------------- config lookup */
  /* Guarded: an out-of-range level id degrades to level 1 rather than
     returning undefined into the board builder. */
  FZ.configFor = function (mode, level, round) {
    var cfg;
    if (mode === 'endless') cfg = FZ.endlessCfg(round | 0);
    else if (mode === 'rush') cfg = FZ.RUSH[FZ.clamp(level | 0, 0, FZ.RUSH.length - 1)] || FZ.RUSH[0];
    else cfg = FZ.LEVELS[FZ.clamp(level | 0, 0, FZ.LEVELS.length - 1)] || FZ.LEVELS[0];
    /* shallow copy so the run can never mutate the authored table */
    var out = {};
    for (var k in cfg) out[k] = cfg[k];
    if (out.refund === undefined) out.refund = 1;
    if (out.sealRefund === undefined) out.sealRefund = 0;
    out.mode = mode;
    return out;
  };

  FZ.levelCount = function (mode) {
    if (mode === 'rush') return FZ.RUSH.length;
    if (mode === 'endless') return 1;
    return FZ.LEVELS.length;
  };

  /* -------------------------------------------------------- medals */
  /* 0 none, 1 bronze, 2 silver, 3 gold. Medal reads three things: did you
     clear it, how much of the move budget you kept, and whether you surfaced
     MORE caps than the goal asked for. Surplus caps promote one tier, so
     generous play is rewarded rather than punished. */
  FZ.MEDAL_NAMES = ['', 'Bronze', 'Silver', 'Gold'];
  FZ.MEDAL_COLORS = [0x5D7294, 0xC98A34, 0xC8D4E4, 0xF7C948];

  FZ.medalFor = function (cfg, res) {
    if (!res || !res.cleared) return 0;
    var budget = Math.max(1, cfg.moves | 0);
    var eff = FZ.clamp((res.movesLeft || 0) / budget, 0, 1);
    var tier = 1;
    if (eff >= 0.30) tier = 3;
    else if (eff >= 0.12) tier = 2;
    var goal = cfg.caps | 0;
    if (goal > 0 && goal < 9999 && (res.capsOut | 0) > goal) tier = Math.min(3, tier + 1);
    return tier;
  };
  FZ.starsFor = FZ.medalFor;   /* stars and medal tiers are the same scale */

  /* ---------------------------------------------------------- save */
  FZ.SAVE_VERSION = 2;
  FZ.blankSave = function () {
    return {
      v: FZ.SAVE_VERSION,
      stars: {},      /* campaign level index -> medal tier 1..3 */
      rush: {},       /* rush level index -> medal tier 1..3 */
      best: 0,        /* endless best score */
      bestRound: 0,   /* endless best round reached */
      unlocked: 1,    /* campaign levels available */
      seen: {}        /* one-shot coach strips already shown */
    };
  };

  FZ.validateSave = function (o) {
    return !!o && typeof o === 'object' && !Array.isArray(o);
  };

  /* Normalises anything that came out of storage. Never trusts shape. */
  FZ.normalizeSave = function (o) {
    var d = FZ.blankSave();
    if (!FZ.validateSave(o)) return d;
    function tier(v) { var n = Math.floor(Number(v)); return (isFinite(n) && n > 0) ? FZ.clamp(n, 1, 3) : 0; }
    function copyTiers(src, dst, max) {
      if (!src || typeof src !== 'object' || Array.isArray(src)) return;
      var keys = Object.keys(src).slice(0, 64);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!/^\d{1,3}$/.test(k)) continue;
        if (Number(k) >= max) continue;
        var t = tier(src[k]);
        if (t > 0) dst[k] = t;
      }
    }
    copyTiers(o.stars, d.stars, FZ.LEVELS.length);
    copyTiers(o.rush, d.rush, FZ.RUSH.length);
    var b = Math.floor(Number(o.best));
    d.best = (isFinite(b) && b > 0) ? FZ.clamp(b, 0, 99999999) : 0;
    var br = Math.floor(Number(o.bestRound));
    d.bestRound = (isFinite(br) && br > 0) ? FZ.clamp(br, 0, 999) : 0;
    var u = Math.floor(Number(o.unlocked));
    d.unlocked = (isFinite(u) && u > 0) ? FZ.clamp(u, 1, FZ.LEVELS.length) : 1;
    if (o.seen && typeof o.seen === 'object' && !Array.isArray(o.seen)) {
      var sk = Object.keys(o.seen).slice(0, 64);
      for (var j = 0; j < sk.length; j++) if (o.seen[sk[j]] === true) d.seen[sk[j]] = true;
    }

    /* Progression is a chain, not a collection of independently writable
       flags. A damaged or hand-edited save may not skip campaign levels. */
    var campaignDone = 0;
    while (d.stars[String(campaignDone)] > 0) campaignDone++;
    for (var ci = campaignDone; ci < FZ.LEVELS.length; ci++) delete d.stars[String(ci)];
    d.unlocked = FZ.clamp(campaignDone + 1, 1, FZ.LEVELS.length);

    /* Seal Rush opens from campaign medals, then advances one level at a time.
       Keep only the contiguous, legitimately reachable prefix. */
    var campaignMedals = campaignDone;
    if (campaignMedals < FZ.RUSH_OPEN_MEDALS) {
      d.rush = {};
    } else {
      var rushDone = 0;
      while (d.rush[String(rushDone)] > 0) rushDone++;
      for (var ri = rushDone; ri < FZ.RUSH.length; ri++) delete d.rush[String(ri)];
    }
    return d;
  };

  FZ.totalMedals = function (save) {
    if (!save) return 0;
    var n = 0, k;
    for (k in save.stars) n += (save.stars[k] | 0) > 0 ? 1 : 0;
    for (k in save.rush) n += (save.rush[k] | 0) > 0 ? 1 : 0;
    return n;
  };
  FZ.totalTiers = function (save) {
    if (!save) return 0;
    var n = 0, k;
    for (k in save.stars) n += (save.stars[k] | 0);
    for (k in save.rush) n += (save.rush[k] | 0);
    return n;
  };
  /* medals earned inside a vat, used for the vat-complete beat */
  FZ.vatProgress = function (save, vatId) {
    var done = 0, total = 0;
    for (var i = 0; i < FZ.LEVELS.length; i++) {
      if (FZ.LEVELS[i].vat !== vatId) continue;
      total++;
      if (save && (save.stars[String(i)] | 0) > 0) done++;
    }
    return { done: done, total: total };
  };

  /* The persistent vat room has one restoration state per completed vat. The
     state is derived from saved campaign medals, so it cannot drift from the
     progression chain or be forged by an extra save field. */
  FZ.metaProgress = function (save) {
    var doneVats = 0;
    for (var v = 0; v < FZ.VATS.length; v++) {
      var p = FZ.vatProgress(save, v);
      if (p.done < p.total) break;
      doneVats++;
    }
    return { doneVats: doneVats, totalVats: FZ.VATS.length };
  };

})(window.FZ);
