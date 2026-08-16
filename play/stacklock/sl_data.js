/* sl_data.js — Stacklock content tables.
 *
 * Everything the designer touches lives here: piece families, the level speed
 * curve, medal tiers, the four board identities and the hand-authored Puzzle
 * board set plus the Master Clear finale.
 *
 * Pure data. No engine references, no DOM, no side effects beyond publishing
 * window.SL_DATA. game.js owns every behaviour that reads it, and every keyed
 * lookup against this file goes through a guarded accessor there (a missing
 * key must degrade, never freeze).
 *
 * Board string alphabet:
 *   '.'  empty cell
 *   '#'  locked ordinary block (its family is derived deterministically from
 *        the cell coordinates so authored stacks stay colourful without the
 *        author picking seven letters per row)
 *   'H'  hazard block. Master Clear is won by removing every one of them.
 *
 * Queue alphabet: I O T J L S Z, plus the two Puzzle pickups:
 *   'W'  wildcard block - a single cell that fills its whole row on lock
 *   'B'  bomb block - a single cell that detonates a 3x3 on lock
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------- families
  // Seven families. Triple-coded per ART_puzzlepop.md: silhouette corner
  // treatment, face hue AND value, plus a centred glyph baked into the atlas
  // frame. Never hue alone.
  var FAMILIES = [
    { key: 'I', name: 'PULSE',  frame: 'blk_bar', color: 0x38a8de, glow: 0xa8e2ff, box: 4 },
    { key: 'O', name: 'NOVA',   frame: 'blk_box', color: 0xf7c948, glow: 0xffeaa6, box: 2 },
    { key: 'T', name: 'WISP',   frame: 'blk_tee', color: 0x9a7cf3, glow: 0xd9ccff, box: 3 },
    { key: 'J', name: 'FLARE',  frame: 'blk_jay', color: 0xf29a4a, glow: 0xffd6ab, box: 3 },
    { key: 'L', name: 'ANCHOR', frame: 'blk_ell', color: 0x4c6fe0, glow: 0xb9c9ff, box: 3 },
    { key: 'S', name: 'MINT',   frame: 'blk_ess', color: 0x5bcb77, glow: 0xc3f5cf, box: 3 },
    { key: 'Z', name: 'FANG',   frame: 'blk_zed', color: 0xf25c68, glow: 0xffc4c9, box: 3 }
  ];

  // Spawn matrices, SRS orientation 0. game.js derives states 1-3 by rotating
  // inside the family's own box, which is what makes the kick tables valid.
  var SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
  };

  // ---------------------------------------------------------- speed curve
  // Milliseconds per gravity row, indexed by level-1. Level-gated, hand
  // tuned: readable through level 8, demanding from 12, brutal at 18+. The
  // last entry repeats for every level past the table (guarded in game.js).
  var GRAVITY = [
    800, 715, 630, 550, 470, 390, 320, 255, 195, 150,
    122, 100, 84, 72, 62, 54, 47, 41, 36, 31,
    27, 24, 21, 18, 16, 14, 13, 12, 11, 10
  ];

  // Lock timing. A short grace window, not instant-lock frustration.
  var LOCK = { graceMs: 500, resets: 15, hardDropGraceMs: 120 };

  // ------------------------------------------------------------- medals
  // Marathon medals are level milestones; Sprint medals are finish times.
  var MEDALS = {
    marathon: [
      { key: 'bronze', frame: 'medal_bronze', name: 'Bronze', level: 5 },
      { key: 'silver', frame: 'medal_silver', name: 'Silver', level: 10 },
      { key: 'gold',   frame: 'medal_gold',   name: 'Gold',   level: 15 },
      { key: 'master', frame: 'medal_master', name: 'Master', level: 20 }
    ],
    sprint: [
      { key: 'bronze', frame: 'medal_bronze', name: 'Bronze', ms: 180000 },
      { key: 'silver', frame: 'medal_silver', name: 'Silver', ms: 135000 },
      { key: 'gold',   frame: 'medal_gold',   name: 'Gold',   ms: 105000 },
      { key: 'master', frame: 'medal_master', name: 'Master', ms: 80000 }
    ],
    // Ultra is a two minute score attack, so its medals are score tiers.
    ultra: [
      { key: 'bronze', frame: 'medal_bronze', name: 'Bronze', score: 6000 },
      { key: 'silver', frame: 'medal_silver', name: 'Silver', score: 12000 },
      { key: 'gold',   frame: 'medal_gold',   name: 'Gold',   score: 20000 },
      { key: 'master', frame: 'medal_master', name: 'Master', score: 32000 }
    ],
    // Rival medals are the tier of opponent you have actually beaten.
    rival: [
      { key: 'bronze', frame: 'medal_bronze', name: 'Bronze', tier: 0 },
      { key: 'silver', frame: 'medal_silver', name: 'Silver', tier: 1 },
      { key: 'master', frame: 'medal_master', name: 'Master', tier: 2 }
    ]
  };

  // ---------------------------------------------------------- rival tiers
  // Difficulty is search quality and hand speed, never a cheat. `error` is the
  // chance the rival slides one rank down its own ranked placement list;
  // `look` turns on the second ply. `stepMs` is one atomic rival action.
  var RIVALS = [
    { key: 'apprentice', name: 'APPRENTICE', sub: 'learning the well',
      stepMs: 235, error: 0.34, look: 0, garbage: 0.7, wins: 0 },
    { key: 'contender', name: 'CONTENDER', sub: 'keeps it flat',
      stepMs: 150, error: 0.13, look: 1, garbage: 1.0, wins: 2 },
    { key: 'architect', name: 'ARCHITECT', sub: 'builds for quads',
      stepMs: 96, error: 0.02, look: 1, garbage: 1.3, wins: 5 }
  ];

  // ----------------------------------------------------------- ultra rules
  // Two minutes. Gravity steps up every ramp window regardless of lines, so
  // the pressure is the clock rather than your own clear rate.
  var ULTRA = { ms: 120000, startLevel: 4, rampMs: 18000, maxLevel: 16 };

  // --------------------------------------------------------- danger state
  // Stack height (in rows above the floor) at which the board shifts into its
  // danger grade. `warn` recolours, `crit` also pulses and ticks.
  var DANGER = { warn: 13, crit: 16, tickMs: 900 };

  // ------------------------------------------------- garbage exchange table
  // Lines sent per clear type, before the back to back and combo bonuses.
  var GARBAGE = {
    lines: [0, 0, 1, 2, 4],
    tspin: [0, 2, 4, 6, 6],
    tspinMini: [0, 0, 1, 2, 2],
    combo: [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5],
    b2b: 1,
    perfect: 10,
    max: 8
  };

  // ------------------------------------------------- board identities (4)
  // Each mode owns a signature treatment: frame material, cell rhythm, sky
  // grade and accent. The board is an object in the scene, never a raw grid.
  var IDENTITIES = {
    marathon: {
      id: 'marathon', name: 'MARATHON', sub: 'Graphite Tower',
      blurb: 'Level up every ten lines. Hold the tower as the gravity curve tightens.',
      sky: ['#0b1020', '#141c38', '#1d2450', '#2a2050'],
      // The evolved sky the background walks toward as the level climbs.
      skyHot: ['#1a0d24', '#3a1442', '#5d1c4c', '#7a2a34'],
      motif: 'grid',
      frame: 0x2b3560, frameEdge: 0x6f80c8, accent: 0xffa724,
      cellA: 0x1b2440, cellB: 0x202a4c, cellAlpha: 0.55, grain: 0.10,
      music: 'music_board'
    },
    sprint: {
      id: 'sprint', name: 'SPRINT 40', sub: 'Clean Line',
      blurb: 'Forty lines, one clock. The grid stays quiet so the timer reads.',
      sky: ['#0a1220', '#12202f', '#183043', '#1d3d4e'],
      skyHot: ['#08161c', '#0f2c34', '#134450', '#175a5e'],
      motif: 'rule',
      frame: 0x27455a, frameEdge: 0x7fc4de, accent: 0x8fe6ff,
      cellA: 0x14202e, cellB: 0x182636, cellAlpha: 0.40, grain: 0.05,
      music: 'music_board'
    },
    ultra: {
      id: 'ultra', name: 'ULTRA 2:00', sub: 'Overclock',
      blurb: 'Two minutes. Gravity ramps on the clock. Score everything.',
      sky: ['#07131a', '#0d2733', '#123c46', '#1c5044'],
      skyHot: ['#101a06', '#2a3a06', '#4c5205', '#6e5c06'],
      motif: 'pulse',
      frame: 0x1e4a48, frameEdge: 0x59e0c4, accent: 0x7dffdc,
      cellA: 0x0f2226, cellB: 0x13292c, cellAlpha: 0.46, grain: 0.08,
      music: 'music_rush'
    },
    puzzle: {
      id: 'puzzle', name: 'PUZZLE', sub: 'Lockworks',
      blurb: 'Hand-authored stacks. Fixed hands, generous pickups, one clean answer.',
      sky: ['#150e1c', '#241634', '#33204a', '#3d2a3e'],
      skyHot: ['#1a1020', '#2b1a3c', '#3b2654', '#463046'],
      motif: 'cog',
      frame: 0x4a3320, frameEdge: 0xd9a04a, accent: 0xffc861,
      cellA: 0x231b30, cellB: 0x2a2038, cellAlpha: 0.60, grain: 0.14,
      music: 'music_board'
    },
    rival: {
      id: 'rival', name: 'RIVAL', sub: 'Duel Works',
      blurb: 'A stacking AI on the next board. Trade buried rows.',
      sky: ['#0c1213', '#17272a', '#1f3a34', '#2b4a2c'],
      skyHot: ['#140f0c', '#2e1c14', '#48281a', '#5e3a1c'],
      motif: 'grid',
      frame: 0x25423a, frameEdge: 0x86d4a2, accent: 0xa8f06a,
      cellA: 0x141f20, cellB: 0x182725, cellAlpha: 0.52, grain: 0.12,
      music: 'music_rush'
    },
    master: {
      id: 'master', name: 'MASTER CLEAR', sub: 'Meltdown',
      blurb: 'The finale. A hazard field is already on the board. Remove all of it.',
      sky: ['#180a10', '#2c0f18', '#48141c', '#5e2216'],
      skyHot: ['#22060a', '#480d12', '#71160f', '#8e3308'],
      motif: 'ember',
      frame: 0x5c2118, frameEdge: 0xff8a3c, accent: 0xff5c3c,
      cellA: 0x281420, cellB: 0x301826, cellAlpha: 0.62, grain: 0.18,
      music: 'music_rush'
    }
  };

  // --------------------------------------------------------- puzzle set
  // 24 hand-authored boards on a deliberate curve.
  //   1-6   shape reading: one gap, one answer
  //   7-12  ordering: the hold slot starts to matter
  //   13-18 hazards arrive, and so do the pickups
  //   19-24 multi-line finishes under a tight hand
  // Every board ships MORE pieces than the minimum. The owner's rule is
  // generous drops: the challenge is the shape, never the supply.
  // `rows` are listed top row first and sit on the FLOOR of the board.
  var PUZZLES = [
    { id: 'p01', name: 'First Lock', goal: 1, holds: 1,
      hint: 'Drop the square into the notch.',
      queue: ['O', 'I', 'T'],
      rows: ['####..####'] },

    { id: 'p02', name: 'Two Deep', goal: 2, holds: 1,
      hint: 'Same notch, twice as deep.',
      queue: ['O', 'O', 'I', 'T'],
      rows: ['####..####', '####..####'] },

    { id: 'p03', name: 'Well', goal: 2, holds: 1,
      hint: 'The long piece stands up.',
      queue: ['I', 'I', 'T', 'L'],
      rows: ['#########.', '#########.'] },

    { id: 'p04', name: 'Doorstep', goal: 2, holds: 1,
      hint: 'An L reads as a step.',
      queue: ['L', 'J', 'I', 'O'],
      rows: ['#######...', '#########.'] },

    { id: 'p05', name: 'Mirror Step', goal: 2, holds: 1,
      hint: 'Then the same step, mirrored.',
      queue: ['J', 'L', 'I', 'O'],
      rows: ['...#######', '.#########'] },

    { id: 'p06', name: 'Tee Time', goal: 2, holds: 1,
      hint: 'A T slots into a three-wide dip.',
      queue: ['T', 'T', 'I', 'O'],
      rows: ['###...####', '####.#####'] },

    { id: 'p07', name: 'Hold It', goal: 2, holds: 2,
      hint: 'Park the first piece. You need it second.',
      queue: ['I', 'O', 'O', 'T', 'L'],
      rows: ['####..####', '#########.', '#########.'] },

    { id: 'p08', name: 'Zigzag', goal: 2, holds: 2,
      hint: 'S and Z only fit one way.',
      queue: ['S', 'Z', 'I', 'O', 'T'],
      rows: ['##..######', '#..#######'] },

    { id: 'p09', name: 'Staircase', goal: 3, holds: 2,
      hint: 'Work down the steps, not across.',
      queue: ['L', 'L', 'J', 'I', 'O', 'T'],
      rows: ['######....', '#####.....', '####......'] },

    { id: 'p10', name: 'Split Well', goal: 2, holds: 2,
      hint: 'Two wells, one long piece each.',
      queue: ['I', 'I', 'O', 'T', 'L'],
      rows: ['.########.', '.########.'] },

    { id: 'p11', name: 'Overhang', goal: 2, holds: 2,
      hint: 'Slide under the lip with a kick.',
      queue: ['J', 'L', 'T', 'I', 'O'],
      rows: ['#####..###', '#######.##', '#######.##'] },

    { id: 'p12', name: 'Comb', goal: 3, holds: 2,
      hint: 'Four teeth, four fills.',
      queue: ['O', 'O', 'I', 'I', 'T', 'L', 'J'],
      rows: ['#..##..###', '#..##..###', '##########'] },

    { id: 'p13', name: 'First Hazard', goal: 2, holds: 2,
      hint: 'Hazard blocks only leave on a cleared line.',
      queue: ['I', 'O', 'T', 'L', 'B'],
      rows: ['##HH..####', '####..####'] },

    { id: 'p14', name: 'Bomb Run', goal: 1, holds: 2,
      hint: 'The bomb takes a three by three bite.',
      queue: ['B', 'I', 'O', 'T'],
      rows: ['###HHH####', '###HHH####', '####..####'] },

    { id: 'p15', name: 'Wildcard', goal: 2, holds: 2,
      hint: 'A wildcard fills its whole row.',
      queue: ['W', 'W', 'I', 'O', 'T'],
      rows: ['#.#.#.#.#.', '.#.#.#.#.#'] },

    { id: 'p16', name: 'Hazard Wall', goal: 3, holds: 3,
      hint: 'Three hazard rows, three clears.',
      queue: ['I', 'I', 'O', 'T', 'L', 'J', 'B'],
      rows: ['HHHH..HHHH', 'HHHH..HHHH', 'HHHH..HHHH'] },

    { id: 'p17', name: 'Keyhole', goal: 3, holds: 3,
      hint: 'One column, three rows, one long piece.',
      queue: ['I', 'I', 'O', 'T', 'L', 'W'],
      rows: ['####.#####', '####.#####', '####.#####'] },

    { id: 'p18', name: 'Cross Cut', goal: 3, holds: 3,
      hint: 'The gaps do not line up. Fix that first.',
      queue: ['S', 'Z', 'T', 'I', 'O', 'L', 'J', 'W'],
      rows: ['##.#####.#', '#.#####.##', '##.#####.#'] },

    { id: 'p19', name: 'Double Header', goal: 4, holds: 3,
      hint: 'Four lines. Bank two, then two.',
      queue: ['I', 'I', 'O', 'O', 'T', 'L', 'J', 'W'],
      rows: ['######....', '######....', '######....', '######....'] },

    { id: 'p20', name: 'Quad Slot', goal: 4, holds: 3,
      hint: 'One column open, four rows deep. Stand the bar up.',
      queue: ['I', 'O', 'T', 'L', 'J', 'S', 'Z'],
      rows: ['#########.', '#########.', '#########.', '#########.'] },

    { id: 'p21', name: 'Hazard Comb', goal: 4, holds: 3,
      hint: 'Hazard teeth. Bombs help, lines finish.',
      queue: ['B', 'B', 'I', 'I', 'O', 'T', 'L', 'W'],
      rows: ['H..HH..HH#', 'H..HH..HH#', '#..##..###', '#..##..###'] },

    { id: 'p22', name: 'Terrace', goal: 4, holds: 3,
      hint: 'A five step terrace. Read the whole board.',
      queue: ['L', 'J', 'L', 'J', 'I', 'I', 'O', 'T', 'W'],
      rows: ['########..', '######....', '####......', '##........'] },

    { id: 'p23', name: 'Pressure', goal: 4, holds: 3,
      hint: 'The stack is already high. Do not build up.',
      queue: ['I', 'O', 'T', 'S', 'Z', 'L', 'J', 'I', 'W', 'B'],
      rows: ['#.########', '##.#######', '###.######', '####.#####',
             '#####.####', '######.###'] },

    { id: 'p24', name: 'Lockworks', goal: 5, holds: 3,
      hint: 'Everything the set taught you, in one board.',
      queue: ['I', 'I', 'O', 'T', 'L', 'J', 'S', 'Z', 'W', 'W', 'B'],
      rows: ['HH..##..HH', '#..####..#', '##.#..#.##', '#..####..#',
             'HH..##..HH'] },

    // 25-30, round 2: the spin school. Every board below is a real T slot -
    // the roof block makes the seat unreachable by a straight drop, so the
    // only way in is a rotation kick. They pay the T-spin bonus on purpose.
    { id: 'p25', name: 'Turn One', goal: 2, holds: 2,
      hint: 'The seat has a roof. Drop the T beside it, then turn it in.',
      queue: ['T', 'T', 'I', 'O', 'L'],
      rows: ['...#......', '###...####', '####.#####'] },

    { id: 'p26', name: 'Mirror Turn', goal: 2, holds: 2,
      hint: 'Same seat, other hand.',
      queue: ['T', 'T', 'I', 'O', 'J'],
      rows: ['......#...', '####...###', '#####.####'] },

    { id: 'p27', name: 'Double Turn', goal: 3, holds: 3,
      hint: 'Spin first. The last column only opens after the rows drop.',
      queue: ['T', 'T', 'I', 'I', 'O', 'L', 'J'],
      rows: ['...#......', '###...####', '####.#####', '#########.'] },

    { id: 'p28', name: 'Wall Turn', goal: 2, holds: 2,
      hint: 'A seat against the wall still needs the turn.',
      queue: ['T', 'T', 'I', 'O', 'J'],
      rows: ['#.........', '...#######', '#.########'] },

    { id: 'p29', name: 'Twin Slots', goal: 2, holds: 3,
      hint: 'Two seats, two turns, one pair of rows.',
      queue: ['T', 'T', 'I', 'O', 'L', 'J', 'W'],
      rows: ['...#...#..', '###...#...', '####.###.#'] },

    { id: 'p30', name: 'Lockspin', goal: 2, holds: 3,
      hint: 'Hazards leave on the spin as readily as on a flat clear.',
      queue: ['T', 'T', 'I', 'O', 'L', 'J', 'W'],
      rows: ['...#......', 'HH#...####', '####.#####'] }
  ];

  // ------------------------------------------------------- master finale
  // A pre-placed hazard field on a fast curve. The win condition is not a
  // line count: every hazard block must be gone.
  var MASTER = {
    id: 'master', name: 'Master Clear', level: 10, holds: 1,
    hint: 'Remove every hazard block. The bag never stops.',
    rows: [
      '..H....H..',
      '.HH#..#HH.',
      '#HH##..HH#',
      '##H#..#H##',
      '#H##..##H#',
      '#H#....#H#',
      'HH##..##HH'
    ]
  };

  // ------------------------------------------------------- spin scoring
  // Base score per spin result, multiplied by level. `mini` is the reduced
  // award when only one front corner of the T is buried.
  var SPINS = {
    full: [400, 800, 1200, 1600, 1600],
    mini: [100, 200, 400, 400, 400],
    perfect: [0, 800, 1200, 1800, 3500]
  };

  root.SL_DATA = {
    FAMILIES: FAMILIES,
    SHAPES: SHAPES,
    GRAVITY: GRAVITY,
    LOCK: LOCK,
    MEDALS: MEDALS,
    IDENTITIES: IDENTITIES,
    PUZZLES: PUZZLES,
    MASTER: MASTER,
    RIVALS: RIVALS,
    ULTRA: ULTRA,
    DANGER: DANGER,
    GARBAGE: GARBAGE,
    SPINS: SPINS
  };
})(typeof window !== 'undefined' ? window : globalThis);
