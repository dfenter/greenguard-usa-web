/* Serpentine - sp_data.js
 * Authored content tables: arena layouts, the round ladder, medal tiers,
 * trail/head unlock chain and the first-run tutorial script.
 *
 * Every table in here is DATA ONLY. No engine references, no DOM. game.js
 * reads it through SP_DATA and every keyed lookup that game.js performs
 * against these tables goes through a guarded accessor (SP_DATA.trail(),
 * SP_DATA.skin(), SP_DATA.arena(), SP_DATA.setPiece()) so a bad or stale
 * saved id can never hard-freeze the title. A FAMILY[variant] miss froze a
 * shipped fleet title once; nothing in Serpentine indexes these maps raw.
 *
 * GRID: every arena map is exactly ROWS rows of exactly COLS characters.
 *   '#'  solid wall (baked into the static board texture)
 *   '.'  open floor
 *   '>'  speed pad
 *   'A'..'D'  timed gate cells, grouped by letter
 *   'o'  authored charge-pip site (the generous early-round drop set)
 *   '*'  set-piece core marker (cosmetic anchor + set-piece hook origin)
 */
(function (root) {
  'use strict';

  var COLS = 19;
  var ROWS = 33;

  // ----------------------------------------------------------- arena maps
  // 1. VECTOR YARD - the open grid. Long sightlines, four corner blocks,
  //    a sealed Pulse Core at the middle that showers bonus pips.
  var MAP_YARD = [
    '###################',
    '#.................#',
    '#..o...........o..#',
    '#.................#',
    '#...##.......##...#',
    '#...##.......##...#',
    '#.................#',
    '#......o...o......#',
    '#.................#',
    '#.....>.....>.....#',
    '#.................#',
    '#.................#',
    '#.......###.......#',
    '#.......#*#.......#',
    '#.......###.......#',
    '#.................#',
    '#...o.........o...#',
    '#.................#',
    '#.................#',
    '#.....>.....>.....#',
    '#.................#',
    '#.......o.o.......#',
    '#.................#',
    '#...##.......##...#',
    '#...##.......##...#',
    '#.................#',
    '#..o...........o..#',
    '#.................#',
    '#.................#',
    '#.................#',
    '#.................#',
    '#.................#',
    '###################'
  ];

  // 2. LOCKSTEP VAULT - the gated maze. Four gates ring the vault core and
  //    open in strict rotation (the Lockstep Cross); two pinch rows split
  //    the board into three wards.
  var MAP_VAULT = [
    '###################',
    '#.................#',
    '#..o...........o..#',
    '#..###.......###..#',
    '#....#...A...#....#',
    '#....#..###..#....#',
    '#.o..D..#*#..B..o.#',
    '#....#..###..#....#',
    '#....#...C...#....#',
    '#..###.......###..#',
    '#..o...........o..#',
    '#.................#',
    '#####.#######.#####',
    '#.......o.o.......#',
    '#.>.............>.#',
    '#.................#',
    '#..####.....####..#',
    '#.....#..o..#.....#',
    '#.....#.....#.....#',
    '#..####.....####..#',
    '#.................#',
    '#.>.............>.#',
    '#.......o.o.......#',
    '#####.#######.#####',
    '#.................#',
    '#..o...........o..#',
    '#..###.......###..#',
    '#....#.......#....#',
    '#.o..#...o...#..o.#',
    '#....#.......#....#',
    '#..###.......###..#',
    '#..o...........o..#',
    '###################'
  ];

  // 3. SLIPSTREAM LOOP - the speed-pad circuit. Two full pad rings; holding
  //    the racing line keeps the boost lit and builds the surge chain.
  var MAP_LOOP = [
    '###################',
    '#.................#',
    '#..>>>>>>>>>>>>>..#',
    '#..>...........>..#',
    '#..>..o.....o..>..#',
    '#..>...........>..#',
    '#..>...#####...>..#',
    '#..>...#...#...>..#',
    '#..>...#.*.#...>..#',
    '#..>...#...#...>..#',
    '#..>...#####...>..#',
    '#..>...........>..#',
    '#..>..o.....o..>..#',
    '#..>...........>..#',
    '#..>>>>>>>>>>>>>..#',
    '#.................#',
    '#..o...........o..#',
    '#.....#######.....#',
    '#.................#',
    '#..o...........o..#',
    '#.................#',
    '#..>>>>>>>>>>>>>..#',
    '#..>...........>..#',
    '#..>...o...o...>..#',
    '#..>...........>..#',
    '#..>....###....>..#',
    '#..>....###....>..#',
    '#..>....###....>..#',
    '#..>...........>..#',
    '#..>>>>>>>>>>>>>..#',
    '#.................#',
    '#..o...........o..#',
    '###################'
  ];

  // 4. COLLAPSE BASIN - the shrinking-storm finale arena. Sparse cover so
  //    the closing ring is always the story; the Storm Eye at the middle
  //    hands out shield charges on a timer.
  var MAP_BASIN = [
    '###################',
    '#.................#',
    '#.o.............o.#',
    '#.................#',
    '#....#.......#....#',
    '#....#..o.o..#....#',
    '#....#.......#....#',
    '#.................#',
    '#..>...........>..#',
    '#.................#',
    '#.......o.o.......#',
    '#.................#',
    '#..###.......###..#',
    '#....#...*...#....#',
    '#..###.......###..#',
    '#.................#',
    '#.......o.o.......#',
    '#.................#',
    '#..>...........>..#',
    '#.................#',
    '#....#.......#....#',
    '#....#..o.o..#....#',
    '#....#.......#....#',
    '#.................#',
    '#.o.............o.#',
    '#.................#',
    '#..###.......###..#',
    '#....#...o...#....#',
    '#..###.......###..#',
    '#.................#',
    '#.o.............o.#',
    '#.................#',
    '###################'
  ];

  // 5. WARDEN KEEP - the hunter arena. Two eight-cell gate pincers (the
  //    Warden Gauntlet) slam in alternation across the full width and the
  //    rival spawns sit deliberately behind them.
  var MAP_KEEP = [
    '###################',
    '#.................#',
    '#..o...........o..#',
    '#..##.........##..#',
    '#..##....o....##..#',
    '#..##.........##..#',
    '#.................#',
    '#....>.......>....#',
    '#.................#',
    '#..AAAA.....AAAA..#',
    '#.................#',
    '#......o...o......#',
    '#.................#',
    '#...##.......##...#',
    '#...##...*...##...#',
    '#...##.......##...#',
    '#.................#',
    '#..o...........o..#',
    '#.................#',
    '#..BBBB.....BBBB..#',
    '#.................#',
    '#....>.......>....#',
    '#.................#',
    '#......o...o......#',
    '#.................#',
    '#..##.........##..#',
    '#..##....o....##..#',
    '#..##.........##..#',
    '#.................#',
    '#..o...........o..#',
    '#.................#',
    '#.................#',
    '###################'
  ];

  // --------------------------------------------------------------- arenas
  // theme.* are 0xRRGGBB ints consumed by the board baker and the HUD.
  var ARENAS = [
    {
      id: 'yard',
      name: 'Vector Yard',
      tagline: 'Open grid. Long lines, no excuses.',
      map: MAP_YARD,
      theme: {
        floorTop: 0x0d1a2c, floorBot: 0x070d1a, grid: 0x1d3f57,
        wall: 0x13314a, wallEdge: 0x3ac6e8, accent: 0x55e7ff,
        pad: 0x7ef2ff, frame: 0x3ac6e8, storm: 0xff668e
      },
      spawn: { c: 3, r: 29, dir: 'up' },
      // Deliberate placement: the first hunter starts far and behind, the
      // second cuts the top lane, the third opens on the low corner so a
      // player hugging the bottom edge is never safe.
      rivalSpawns: [
        { c: 15, r: 29, dir: 'up' },
        { c: 15, r: 3, dir: 'down' },
        { c: 7, r: 3, dir: 'down' }
      ],
      setPiece: 'pulseCore',
      setPieceName: 'Pulse Core',
      gates: {},
      pipBase: 11
    },
    {
      id: 'vault',
      name: 'Lockstep Vault',
      tagline: 'Gated maze. Read the clang, take the gap.',
      map: MAP_VAULT,
      theme: {
        floorTop: 0x161227, floorBot: 0x0a0817, grid: 0x3a2f5c,
        wall: 0x241d40, wallEdge: 0xc789ff, accent: 0xc789ff,
        pad: 0xe0c0ff, frame: 0x9a6cff, storm: 0xff668e
      },
      // The player opens in the wide middle ward, on the pad row, so the
      // first thing the arena teaches is its own speed line.
      spawn: { c: 5, r: 14, dir: 'right' },
      // One hunter per ward, none of them opening on the player's lane.
      rivalSpawns: [
        { c: 9, r: 2, dir: 'right' },
        { c: 16, r: 15, dir: 'left' },
        { c: 9, r: 31, dir: 'right' }
      ],
      setPiece: 'lockstepCross',
      setPieceName: 'Lockstep Cross',
      // Rotation: the four vault gates share one period and split it into
      // quarters, so exactly one approach is shut at a time.
      gates: {
        A: { period: 7.2, phase: 0.0, openFrac: 0.62 },
        B: { period: 7.2, phase: 1.8, openFrac: 0.62 },
        C: { period: 7.2, phase: 3.6, openFrac: 0.62 },
        D: { period: 7.2, phase: 5.4, openFrac: 0.62 }
      },
      pipBase: 12
    },
    {
      id: 'loop',
      name: 'Slipstream Loop',
      tagline: 'Pad circuit. Hold the line, feed the surge.',
      map: MAP_LOOP,
      theme: {
        floorTop: 0x0a1f1c, floorBot: 0x05100f, grid: 0x1c5049,
        wall: 0x0f3a34, wallEdge: 0x49ffd0, accent: 0x49ffd0,
        pad: 0xc8fff0, frame: 0x2fd6ad, storm: 0xff9b4a
      },
      spawn: { c: 9, r: 18, dir: 'right' },
      rivalSpawns: [
        { c: 4, r: 8, dir: 'down' },
        { c: 14, r: 25, dir: 'up' },
        { c: 9, r: 31, dir: 'left' }
      ],
      setPiece: 'slipstreamRing',
      setPieceName: 'Slipstream Ring',
      gates: {},
      pipBase: 12
    },
    {
      id: 'basin',
      name: 'Collapse Basin',
      tagline: 'The storm closes. Live in the middle.',
      map: MAP_BASIN,
      theme: {
        floorTop: 0x2a1220, floorBot: 0x140812, grid: 0x5d2743,
        wall: 0x3d1a2e, wallEdge: 0xff8fb4, accent: 0xffb26b,
        pad: 0xffd9a8, frame: 0xff668e, storm: 0xff3c6e
      },
      spawn: { c: 9, r: 23, dir: 'up' },
      rivalSpawns: [
        { c: 4, r: 9, dir: 'right' },
        { c: 14, r: 9, dir: 'left' },
        { c: 6, r: 16, dir: 'right' }
      ],
      setPiece: 'stormEye',
      setPieceName: 'Storm Eye',
      gates: {},
      pipBase: 13
    },
    {
      id: 'keep',
      name: 'Warden Keep',
      tagline: 'Hunter ground. The gauntlet slams both ways.',
      map: MAP_KEEP,
      theme: {
        floorTop: 0x121a0f, floorBot: 0x080d08, grid: 0x2f4a24,
        wall: 0x1c2f16, wallEdge: 0xa8e05a, accent: 0xc6ff6b,
        pad: 0xe8ffb0, frame: 0x8fc93f, storm: 0xff668e
      },
      spawn: { c: 9, r: 30, dir: 'up' },
      // Both pincers sit between the player and the hunters on purpose: a
      // hunter can only reach the player through a gate the player can read.
      rivalSpawns: [
        { c: 4, r: 2, dir: 'right' },
        { c: 2, r: 11, dir: 'right' },
        { c: 16, r: 23, dir: 'left' }
      ],
      setPiece: 'wardenGauntlet',
      setPieceName: 'Warden Gauntlet',
      gates: {
        A: { period: 6.4, phase: 0.0, openFrac: 0.58 },
        B: { period: 6.4, phase: 3.2, openFrac: 0.58 }
      },
      pipBase: 12
    }
  ];

  // ---------------------------------------------------------- round ladder
  // par     - seconds of survival that clears the round (gold line)
  // rivals  - hunter count, skill - hunter lookahead quality 0..1
  // pipGoal - pips needed alongside the clear for platinum
  // stepMs  - base ms between snake steps (lower is faster)
  // shrink  - null, or { start, period, max } in seconds / rings
  var ROUNDS = [
    { n: 1, arena: 'yard', par: 45, rivals: 1, skill: 0.34, pipGoal: 8, stepMs: 132, shrink: null, banner: 'Warm the line' },
    { n: 2, arena: 'yard', par: 55, rivals: 2, skill: 0.44, pipGoal: 10, stepMs: 128, shrink: null, banner: 'Two on the grid' },
    { n: 3, arena: 'vault', par: 60, rivals: 2, skill: 0.50, pipGoal: 12, stepMs: 126, shrink: null, banner: 'Mind the lockstep' },
    { n: 4, arena: 'loop', par: 60, rivals: 2, skill: 0.52, pipGoal: 14, stepMs: 124, shrink: null, banner: 'Find the racing line' },
    { n: 5, arena: 'vault', par: 65, rivals: 3, skill: 0.56, pipGoal: 14, stepMs: 120, shrink: null, banner: 'The vault tightens' },
    { n: 6, arena: 'keep', par: 70, rivals: 3, skill: 0.62, pipGoal: 16, stepMs: 118, shrink: null, banner: 'Gauntlet open' },
    { n: 7, arena: 'loop', par: 70, rivals: 3, skill: 0.66, pipGoal: 18, stepMs: 114, shrink: null, banner: 'Surge or lose it' },
    { n: 8, arena: 'basin', par: 75, rivals: 2, skill: 0.68, pipGoal: 16, stepMs: 116, shrink: { start: 22, period: 11, max: 4 }, banner: 'Storm rolls in' },
    { n: 9, arena: 'keep', par: 80, rivals: 3, skill: 0.72, pipGoal: 20, stepMs: 112, shrink: null, banner: 'Wardens awake' },
    { n: 10, arena: 'vault', par: 85, rivals: 3, skill: 0.78, pipGoal: 22, stepMs: 110, shrink: { start: 34, period: 13, max: 3 }, banner: 'Vault collapse' },
    { n: 11, arena: 'loop', par: 85, rivals: 3, skill: 0.84, pipGoal: 24, stepMs: 106, shrink: { start: 34, period: 13, max: 3 }, banner: 'Loop under pressure' },
    { n: 12, arena: 'basin', par: 95, rivals: 3, skill: 0.92, pipGoal: 26, stepMs: 104, shrink: { start: 16, period: 9, max: 5 }, banner: 'Storm finale' }
  ];

  // Endless ladder past round 12: cycle the arenas, keep adding pressure.
  var ENDLESS_ARENAS = ['loop', 'keep', 'vault', 'basin', 'yard'];

  function endlessRound(n) {
    var over = n - ROUNDS.length;          // 1, 2, 3, ...
    var arena = ENDLESS_ARENAS[(over - 1) % ENDLESS_ARENAS.length];
    return {
      n: n,
      arena: arena,
      par: Math.min(150, 95 + over * 5),
      rivals: 3,
      skill: Math.min(0.97, 0.92 + over * 0.01),
      pipGoal: 26 + over * 2,
      stepMs: Math.max(88, 104 - over * 2),
      shrink: { start: Math.max(12, 16 - over), period: Math.max(7, 9 - Math.floor(over / 2)), max: 5 },
      banner: 'Endless ' + over
    };
  }

  // ---------------------------------------------------------- medal tiers
  // Tiers are survival-time fractions of the round par. Platinum also wants
  // the pip goal, so the top tier always costs a risk the player chose.
  var MEDALS = [
    { id: 'none', name: 'No medal', rank: 0, color: 0x63798c, frac: 0 },
    { id: 'bronze', name: 'Bronze', rank: 1, color: 0xd08a4a, frac: 0.40 },
    { id: 'silver', name: 'Silver', rank: 2, color: 0xc9d6e2, frac: 0.70 },
    { id: 'gold', name: 'Gold', rank: 3, color: 0xffc85c, frac: 1.0 },
    { id: 'platinum', name: 'Platinum', rank: 4, color: 0x9ef6ff, frac: 1.0 }
  ];

  // ------------------------------------------------------- trail variants
  // body is a tail-to-head color ramp; the renderer lerps across it.
  var TRAILS = {
    pulse: {
      id: 'pulse', name: 'Pulse', req: null,
      reqText: 'Unlocked',
      body: [0x0f5b78, 0x2aa8cc, 0x55e7ff], head: 0xdff8ff, glow: 0x55e7ff
    },
    ember: {
      id: 'ember', name: 'Ember', req: { rounds: 2 },
      reqText: 'Clear round 2',
      body: [0x7a1f10, 0xe0561f, 0xffb45c], head: 0xfff0d8, glow: 0xff8a3c
    },
    frost: {
      id: 'frost', name: 'Frost', req: { pips: 120 },
      reqText: 'Collect 120 pips',
      body: [0x2b3f7a, 0x6f9de0, 0xd8ecff], head: 0xffffff, glow: 0x9fd0ff
    },
    venom: {
      id: 'venom', name: 'Venom', req: { gold: 4 },
      reqText: 'Earn 4 gold medals',
      body: [0x1d4a12, 0x66c02f, 0xc6ff6b], head: 0xf2ffd8, glow: 0xa8e05a
    },
    aurora: {
      id: 'aurora', name: 'Aurora', req: { rounds: 8 },
      reqText: 'Clear round 8',
      body: [0x4a1b6e, 0xa050e0, 0x6ff0d0], head: 0xeafff8, glow: 0xc789ff
    },
    solaris: {
      id: 'solaris', name: 'Solaris', req: { platinum: 3 },
      reqText: 'Earn 3 platinum medals',
      body: [0x7a2a06, 0xffb02e, 0xfff6c2], head: 0xffffff, glow: 0xffd36b
    }
  };
  var TRAIL_ORDER = ['pulse', 'ember', 'frost', 'venom', 'aurora', 'solaris'];

  // ---------------------------------------------------- head skin variants
  // shape drives the baked head texture; there is no per-frame branching.
  var SKINS = {
    arrow: { id: 'arrow', name: 'Arrow', shape: 'arrow', req: null, reqText: 'Unlocked' },
    visor: { id: 'visor', name: 'Visor', shape: 'visor', req: { rounds: 4 }, reqText: 'Clear round 4' },
    crown: { id: 'crown', name: 'Crown', shape: 'crown', req: { rounds: 10 }, reqText: 'Clear round 10' },
    halo: { id: 'halo', name: 'Halo', shape: 'halo', req: { survival: 600 }, reqText: 'Survive 600s total' }
  };
  var SKIN_ORDER = ['arrow', 'visor', 'crown', 'halo'];

  // ------------------------------------------------------------- tutorial
  // Three short beats on one thin top strip. Never the center, never the
  // bottom half: the coach line fades after three seconds.
  var TUTORIAL = [
    { id: 'turn', text: 'TURN TO THE MARKER', done: 'turn', minMs: 0 },
    { id: 'grow', text: 'COLLECT THE MARKED PIP', done: 'pip', minMs: 0 },
    { id: 'avoid', text: 'AVOID WALLS + TRAILS', done: 'time', minMs: 4200 }
  ];

  // ------------------------------------------------------------ accessors
  // Guarded, always. A stale saved id returns the default entry, never
  // undefined, so no lookup can freeze a frame.
  var ARENA_BY_ID = {};
  for (var ai = 0; ai < ARENAS.length; ai++) ARENA_BY_ID[ARENAS[ai].id] = ARENAS[ai];

  var SP_DATA = {
    COLS: COLS,
    ROWS: ROWS,
    ARENAS: ARENAS,
    ROUNDS: ROUNDS,
    MEDALS: MEDALS,
    TRAILS: TRAILS,
    TRAIL_ORDER: TRAIL_ORDER,
    SKINS: SKINS,
    SKIN_ORDER: SKIN_ORDER,
    TUTORIAL: TUTORIAL,

    arena: function (id) {
      return (id && ARENA_BY_ID[id]) || ARENAS[0];
    },
    arenaIds: function () {
      var out = [];
      for (var i = 0; i < ARENAS.length; i++) out.push(ARENAS[i].id);
      return out;
    },
    round: function (n) {
      var i = Math.max(1, Math.floor(n || 1));
      if (i <= ROUNDS.length) return ROUNDS[i - 1];
      return endlessRound(i);
    },
    lastAuthoredRound: ROUNDS.length,
    trail: function (id) {
      return (id && TRAILS[id]) || TRAILS.pulse;
    },
    skin: function (id) {
      return (id && SKINS[id]) || SKINS.arrow;
    },
    medal: function (id) {
      for (var i = 0; i < MEDALS.length; i++) if (MEDALS[i].id === id) return MEDALS[i];
      return MEDALS[0];
    },
    // survived seconds + pips against a round -> medal id
    medalFor: function (round, survived, pips) {
      var par = (round && round.par) || 45;
      if (survived >= par) return (pips >= ((round && round.pipGoal) || 0)) ? 'platinum' : 'gold';
      if (survived >= par * 0.70) return 'silver';
      if (survived >= par * 0.40) return 'bronze';
      return 'none';
    },
    // Milestone check for the unlock chain. progress is the saved profile.
    meetsReq: function (req, progress) {
      if (!req) return true;
      var p = progress || {};
      if (req.rounds != null && (p.bestRound || 0) < req.rounds) return false;
      if (req.pips != null && (p.totalPips || 0) < req.pips) return false;
      if (req.gold != null && (p.goldCount || 0) < req.gold) return false;
      if (req.platinum != null && (p.platinumCount || 0) < req.platinum) return false;
      if (req.survival != null && (p.totalSurvival || 0) < req.survival) return false;
      return true;
    },
    // Structural self-check. game.js runs this at boot and refuses to bake a
    // malformed arena rather than drawing a broken board.
    validate: function () {
      var errs = [];
      for (var i = 0; i < ARENAS.length; i++) {
        var a = ARENAS[i];
        if (a.map.length !== ROWS) errs.push(a.id + ': ' + a.map.length + ' rows, want ' + ROWS);
        for (var r = 0; r < a.map.length; r++) {
          if (a.map[r].length !== COLS) errs.push(a.id + ' row ' + r + ': ' + a.map[r].length + ' cols, want ' + COLS);
        }
        var sp = a.spawn;
        if (!sp || a.map[sp.r].charAt(sp.c) === '#') errs.push(a.id + ': player spawn is not open floor');
        for (var k = 0; k < a.rivalSpawns.length; k++) {
          var rs = a.rivalSpawns[k];
          if (a.map[rs.r].charAt(rs.c) === '#') errs.push(a.id + ': rival spawn ' + k + ' is not open floor');
        }
        // Every gate letter used on the map must have a timing entry.
        for (var r2 = 0; r2 < a.map.length; r2++) {
          for (var c2 = 0; c2 < a.map[r2].length; c2++) {
            var ch = a.map[r2].charAt(c2);
            if (ch >= 'A' && ch <= 'D' && !a.gates[ch]) errs.push(a.id + ': gate ' + ch + ' has no timing');
          }
        }
      }
      return errs;
    }
  };

  root.SP_DATA = SP_DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = SP_DATA;
})(typeof window !== 'undefined' ? window : globalThis);
