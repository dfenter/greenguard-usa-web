/* Fizzlift - 20 seeded levels + endless generator.
   bp = boundary pattern id, wave = mid-level boundary travel amplitude,
   every = moves between boundary shifts. */
(function (FZ) {

  /* boundary pattern -> row index per column (0..ROWS) */
  FZ.bndPattern = function (bp, c, cols, rows) {
    var m = (cols - 1) / 2, h = rows;
    switch (bp) {
      case 0: return Math.round(h * 0.45);                                  // flat
      case 1: return Math.round(h * 0.25 + (c / (cols - 1)) * h * 0.45);    // ramp
      case 2: return Math.round(h * 0.68 - Math.abs(c - m) * (h * 0.10));   // valley (fizz bowl)
      case 3: return Math.round(h * 0.25 + Math.abs(c - m) * (h * 0.11));   // dome
      case 4: return Math.round(h * 0.46 + Math.sin(c * 1.05) * h * 0.20);  // wave
      case 5: return Math.round(h * 0.30 + (c % 2) * h * 0.34);             // comb
      case 6: return Math.round(h * 0.70 - (c / (cols - 1)) * h * 0.48);    // reverse ramp
      default: return Math.round(h * 0.5);
    }
  };
  FZ.PATTERN_NAMES = ['Flat pour', 'Tilted glass', 'Fizz bowl', 'Domed head', 'Rolling wave', 'Comb split', 'Backwash'];

  /* seal positions are generated deterministically from the seed at board build */
  FZ.LEVELS = [
    { seed: 1101, colors: 4, moves: 22, caps: 3, seals: 0, bp: 0, wave: 0, every: 0 },
    { seed: 1202, colors: 4, moves: 22, caps: 5, seals: 0, bp: 0, wave: 0, every: 0 },
    { seed: 1303, colors: 4, moves: 24, caps: 5, seals: 1, bp: 1, wave: 0, every: 0 },
    { seed: 1404, colors: 5, moves: 24, caps: 6, seals: 1, bp: 2, wave: 0, every: 0 },
    { seed: 1505, colors: 5, moves: 26, caps: 6, seals: 2, bp: 4, wave: 1, every: 5 },
    { seed: 1606, colors: 5, moves: 24, caps: 7, seals: 2, bp: 3, wave: 1, every: 5 },
    { seed: 1707, colors: 5, moves: 26, caps: 8, seals: 2, bp: 5, wave: 1, every: 4 },
    { seed: 1808, colors: 5, moves: 26, caps: 8, seals: 3, bp: 1, wave: 1, every: 4 },
    { seed: 1909, colors: 5, moves: 28, caps: 9, seals: 3, bp: 2, wave: 2, every: 4 },
    { seed: 2010, colors: 5, moves: 28, caps: 9, seals: 3, bp: 6, wave: 1, every: 3 },
    { seed: 2111, colors: 6, moves: 31, caps: 10, seals: 3, bp: 4, wave: 2, every: 3 },
    { seed: 2212, colors: 6, moves: 31, caps: 10, seals: 4, bp: 5, wave: 2, every: 4 },
    { seed: 2313, colors: 6, moves: 32, caps: 11, seals: 4, bp: 3, wave: 2, every: 3 },
    { seed: 2414, colors: 6, moves: 31, caps: 11, seals: 4, bp: 2, wave: 2, every: 3 },
    { seed: 2515, colors: 6, moves: 32, caps: 12, seals: 5, bp: 6, wave: 2, every: 3 },
    { seed: 2616, colors: 6, moves: 32, caps: 12, seals: 5, bp: 0, wave: 2, every: 2 },
    { seed: 2717, colors: 6, moves: 34, caps: 13, seals: 5, bp: 5, wave: 2, every: 3 },
    { seed: 2818, colors: 6, moves: 33, caps: 13, seals: 5, bp: 4, wave: 3, every: 3 },
    { seed: 2919, colors: 6, moves: 32, caps: 14, seals: 6, bp: 1, wave: 3, every: 2 },
    { seed: 3020, colors: 6, moves: 34, caps: 15, seals: 6, bp: 2, wave: 3, every: 2 }
  ];

  FZ.endlessCfg = function (round) {
    var r = FZ.clamp(round | 0, 0, 999);
    return {
      seed: 90001 + r * 7717,
      colors: r < 2 ? 5 : 6,
      moves: 20,
      caps: 999,
      seals: Math.min(4, 1 + ((r / 2) | 0)),
      bp: r % 7,
      wave: Math.min(3, 1 + ((r / 3) | 0)),
      every: r < 3 ? 4 : (r < 8 ? 3 : 2),
      endless: true
    };
  };

  FZ.starsFor = function (cfg, movesLeft) {
    var f = movesLeft / Math.max(1, cfg.moves);
    if (f >= 0.35) return 3;
    if (f >= 0.12) return 2;
    return 1;
  };

})(window.FZ);
