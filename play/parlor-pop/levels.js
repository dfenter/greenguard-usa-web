/* Parlor Pop - levels.js
   20 seeded levels. `moves` values are verified by verify.js (random-playout
   win-rate check at build time) and bumped until each level clears reliably. */
(function (root) {
  'use strict';
  // g(): goal helpers
  function col(c, n) { return { type: 'collect', color: c, n: n }; }
  function plates() { return { type: 'plates' }; }
  function keys(n) { return { type: 'keys', n: n }; }

  var LEVELS = [
    { name: 'Dust Sheets', seed: 10131, colors: 5, moves: 24, goals: [col(0, 18)], crates: 0, ivy: 0, plates: 0, dbl: 0, keys: 0 },
    { name: 'Front Hall', seed: 20147, colors: 5, moves: 18, goals: [col(1, 14), col(2, 14)], crates: 0, ivy: 0, plates: 0, dbl: 0, keys: 0 },
    { name: 'Loose Boards', seed: 30211, colors: 5, moves: 18, goals: [plates()], crates: 0, ivy: 0, plates: 10, dbl: 0, keys: 0 },
    { name: 'Packing Crates', seed: 40357, colors: 5, moves: 18, goals: [col(3, 18)], crates: 6, ivy: 0, plates: 0, dbl: 0, keys: 0 },
    { name: 'Cellar Key', seed: 50473, colors: 5, moves: 18, goals: [keys(1)], crates: 4, ivy: 0, plates: 0, dbl: 0, keys: 1 },
    { name: 'Creeping Green', seed: 60611, colors: 6, moves: 37, goals: [col(0, 18)], crates: 0, ivy: 4, plates: 0, dbl: 0, keys: 0 },
    { name: 'Parquet', seed: 71990, colors: 6, moves: 18, goals: [plates()], crates: 2, ivy: 0, plates: 8, dbl: 0, keys: 0 },
    { name: 'Two Keys Down', seed: 80849, colors: 6, moves: 32, goals: [keys(2)], crates: 4, ivy: 0, plates: 0, dbl: 0, keys: 2 },
    { name: 'Wallpaper', seed: 90967, colors: 6, moves: 27, goals: [col(2, 16), col(4, 14)], crates: 4, ivy: 2, plates: 0, dbl: 0, keys: 0 },
    { name: 'Drawing Room', seed: 101089, colors: 6, moves: 30, goals: [plates(), col(1, 14)], crates: 4, ivy: 0, plates: 12, dbl: 4, keys: 0 },
    { name: 'Ivy Window', seed: 111213, colors: 6, moves: 34, goals: [col(5, 18)], crates: 2, ivy: 6, plates: 0, dbl: 0, keys: 0 },
    { name: 'Servant Stair', seed: 126275, colors: 6, moves: 18, goals: [keys(2), col(0, 12)], crates: 4, ivy: 2, plates: 0, dbl: 0, keys: 2 },
    { name: 'Cracked Tiles', seed: 131459, colors: 6, moves: 34, goals: [plates()], crates: 5, ivy: 3, plates: 14, dbl: 5, keys: 0 },
    { name: 'Long Gallery', seed: 141571, colors: 7, moves: 40, goals: [col(3, 15), col(6, 13)], crates: 3, ivy: 0, plates: 0, dbl: 0, keys: 0 },
    { name: 'Sun Room', seed: 151693, colors: 7, moves: 22, goals: [plates(), keys(1)], crates: 4, ivy: 2, plates: 10, dbl: 3, keys: 1 },
    { name: 'Choked Vines', seed: 161811, colors: 7, moves: 37, goals: [col(1, 17)], crates: 2, ivy: 8, plates: 0, dbl: 0, keys: 0 },
    { name: 'Music Room', seed: 171927, colors: 7, moves: 38, goals: [keys(2)], crates: 4, ivy: 3, plates: 0, dbl: 0, keys: 2 },
    { name: 'Grand Landing', seed: 182053, colors: 7, moves: 45, goals: [plates(), col(4, 14)], crates: 6, ivy: 3, plates: 14, dbl: 5, keys: 0 },
    { name: 'Conservatory', seed: 192179, colors: 7, moves: 54, goals: [col(0, 14), col(2, 14), col(5, 12)], crates: 4, ivy: 4, plates: 0, dbl: 0, keys: 0 },
    { name: 'The Reopening', seed: 202297, colors: 7, moves: 49, goals: [plates(), keys(2)], crates: 5, ivy: 3, plates: 6, dbl: 1, keys: 2 }
  ];

  root.PP = root.PP || {};
  root.PP.levels = LEVELS;
  if (typeof module !== 'undefined' && module.exports) module.exports = LEVELS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
