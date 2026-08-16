/* Beastbind Cards - original card set, factions, gauntlet ladder, draft and
 * pack tables. Pure data plus small helpers. No borrowed names or trade dress. */
(function (root) {
  'use strict';

  // Factions: 0 Ember, 1 Tide, 2 Thornwood, 3 Storm
  var EL = ['Ember', 'Tide', 'Thornwood', 'Storm'];
  var EL_SHORT = ['EMB', 'TID', 'THN', 'STM'];
  var EL_COL = ['#e2603a', '#3d8fd0', '#4fa35c', '#b084e8'];
  var EL_LIGHT = ['#ffb27e', '#8fd0f5', '#a3e2ac', '#ddc0ff'];
  var EL_DIM = ['#4a2117', '#152f45', '#18321e', '#2d1f45'];
  var EL_GLYPH = ['▲', '●', '◆', '✦'];
  // Bind ring: Ember burns Thornwood, Thornwood drinks Tide,
  // Tide grounds Storm, Storm smothers Ember.
  // WEAK_TO[defenderElement] = attacker element that deals double.
  var WEAK_TO = [3, 2, 0, 1];

  var RAR = ['Common', 'Uncommon', 'Rare'];
  var RAR_COL = ['#9aa3ad', '#63b7d8', '#e0b34a'];

  // line data: [element, lineName, [ [name, hp, retreat, attacks], x3 ] ]
  // attack: [name, totalCost, matchingCost, damage, effect?]
  var LINES = [
    // ---------------- EMBER ----------------
    [0, 'Cinder Pack', [
      ['Cinderpup', 60, 1, [['Nip', 1, 1, 20]]],
      ['Blazehound', 90, 1, [['Snap', 1, 1, 30], ['Flare Rush', 2, 1, 50]]],
      ['Pyrewarden', 150, 2, [['Scorch', 2, 1, 70], ['Sunbrand', 3, 2, 110, 'recoil:20']]]
    ]],
    [0, 'Emberwing', [
      ['Embermoth', 50, 1, [['Ash Dust', 1, 0, 10, 'draw']]],
      ['Flarewing', 80, 1, [['Wing Cut', 1, 1, 20], ['Ash Storm', 2, 1, 40, 'bench:10']]],
      ['Solarch', 140, 1, [['Glare', 2, 1, 60], ['Corona', 3, 2, 100, 'bench:20']]]
    ]],
    [0, 'Sootclaw', [
      ['Ashkit', 70, 2, [['Tumble', 1, 0, 10]]],
      ['Sootpaw', 100, 2, [['Cinder Paw', 1, 1, 30]]],
      ['Cindermaw', 170, 3, [['Maul', 2, 1, 60], ['Ember Tide', 3, 2, 110, 'heal:20']]]
    ]],
    [0, 'Forgeshell', [
      ['Kindlebug', 50, 1, [['Spark', 1, 1, 20]]],
      ['Torchbeetle', 80, 1, [['Ignite', 1, 1, 20, 'heal:10'], ['Blast Shell', 2, 2, 60, 'recoil:20']]],
      ['Magmabore', 150, 3, [['Drill', 2, 1, 70], ['Mantle Break', 3, 2, 120, 'recoil:30']]]
    ]],
    [0, 'Flamestride', [
      ['Sparkfoal', 60, 1, [['Kick', 1, 0, 10]]],
      ['Flamestride', 90, 1, [['Trample', 1, 1, 30], ['Heat Dash', 2, 1, 40, 'heal:20']]],
      ['Infernomane', 140, 2, [['Char', 2, 1, 60, 'bench:10'], ['Solar Charge', 3, 2, 100, 'draw']]]
    ]],
    // ---------------- TIDE ----------------
    [1, 'Mistcall', [
      ['Dewsprite', 60, 1, [['Splash', 1, 1, 20]]],
      ['Mistdancer', 90, 1, [['Ripple', 1, 1, 30], ['Mist Veil', 2, 1, 40, 'shield:20']]],
      ['Tidewraith', 150, 2, [['Undertow', 2, 1, 70], ['Deluge', 3, 2, 110, 'gust']]]
    ]],
    [1, 'Reefjaw', [
      ['Pebblefin', 70, 2, [['Bump', 1, 0, 10]]],
      ['Coralfang', 100, 2, [['Bite', 1, 1, 30]]],
      ['Abyssjaw', 170, 3, [['Crush', 2, 1, 70], ['Trench Maw', 3, 2, 120]]]
    ]],
    [1, 'Brinecrest', [
      ['Brinehatch', 50, 1, [['Bubble', 1, 0, 10, 'draw']]],
      ['Wavecrest', 80, 1, [['Surf', 1, 1, 20], ['Crest Break', 2, 1, 50]]],
      ['Maelstrider', 140, 2, [['Whirl', 2, 1, 60, 'bench:10'], ['Maelstrom', 3, 2, 100, 'bench:20']]]
    ]],
    [1, 'Rimehold', [
      ['Frostmite', 60, 1, [['Chill', 1, 1, 10, 'stall']]],
      ['Glacierling', 90, 2, [['Frost Bite', 1, 1, 30], ['Ice Wall', 2, 1, 30, 'shield:30']]],
      ['Rimecolossus', 160, 3, [['Glacier Slam', 2, 1, 70], ['Absolute Zero', 3, 2, 100, 'stall']]]
    ]],
    [1, 'Riptide', [
      ['Puddlepod', 50, 1, [['Squirt', 1, 1, 20]]],
      ['Streamcoil', 80, 1, [['Coil', 1, 1, 20, 'heal:10'], ['Torrent', 2, 2, 60]]],
      ['Riptidon', 150, 2, [['Riptide', 2, 1, 70], ['Sink', 3, 2, 110, 'drain:30']]]
    ]],
    // ---------------- THORNWOOD ----------------
    [2, 'Thornvine', [
      ['Seedling', 60, 1, [['Sprout', 1, 1, 20]]],
      ['Vinewhelp', 90, 1, [['Lash', 1, 1, 30], ['Vine Snare', 2, 1, 40, 'stall']]],
      ['Thornlord', 150, 2, [['Thorn Volley', 2, 1, 70], ['Verdant Judgment', 3, 2, 110, 'heal:30']]]
    ]],
    [2, 'Grovewatch', [
      ['Mossnib', 50, 1, [['Scratch', 1, 0, 10, 'draw']]],
      ['Fernclaw', 80, 1, [['Rake', 1, 1, 20], ['Frond Slash', 2, 1, 50]]],
      ['Grovekeeper', 140, 2, [['Root Grip', 2, 1, 60, 'stall'], ['Grove Bloom', 3, 2, 100, 'heal:40']]]
    ]],
    [2, 'Petalguard', [
      ['Budbeetle', 70, 2, [['Headbutt', 1, 0, 10]]],
      ['Petalguard', 100, 2, [['Petal Guard', 1, 1, 20, 'shield:20'], ['Bloom Strike', 2, 1, 50]]],
      ['Bloomtitan', 160, 3, [['Pollen Crush', 2, 1, 70], ['Titan Bloom', 3, 2, 110, 'heal:20']]]
    ]],
    [2, 'Barkhide', [
      ['Spineburr', 70, 2, [['Prick', 1, 1, 20]]],
      ['Bramblehide', 100, 3, [['Barb', 1, 1, 30], ['Bramble Wall', 2, 1, 30, 'shield:30']]],
      ['Barkbehemoth', 180, 3, [['Bark Slam', 2, 1, 70], ['Old Growth', 3, 2, 120]]]
    ]],
    [2, 'Sporeweave', [
      ['Sporelet', 50, 1, [['Spore', 1, 1, 10, 'stall']]],
      ['Fungalope', 90, 1, [['Cap Slam', 1, 1, 30], ['Spore Cloud', 2, 1, 40, 'bench:20']]],
      ['Mycelarch', 150, 2, [['Rot', 2, 1, 60, 'drain:20'], ['Mycelium Web', 3, 2, 100, 'gust']]]
    ]],
    // ---------------- STORM ----------------
    [3, 'Galecall', [
      ['Zephyrkit', 60, 1, [['Gust Nip', 1, 1, 20]]],
      ['Windrake', 90, 1, [['Slice', 1, 1, 30], ['Gale Rush', 2, 1, 50]]],
      ['Tempestrix', 150, 2, [['Shear', 2, 1, 70], ['Cyclone Verdict', 3, 2, 110, 'gust']]]
    ]],
    [3, 'Voltmane', [
      ['Sparkfawn', 50, 1, [['Static', 1, 0, 10, 'draw']]],
      ['Boltmane', 80, 1, [['Jolt', 1, 1, 20], ['Arc Storm', 2, 1, 40, 'bench:10']]],
      ['Thunderhoof', 140, 1, [['Surge', 2, 1, 60], ['Skyfall Charge', 3, 2, 100, 'bench:20']]]
    ]],
    [3, 'Stormshell', [
      ['Gustling', 70, 2, [['Buffet', 1, 0, 10]]],
      ['Squallshell', 100, 2, [['Shell Slam', 1, 1, 30]]],
      ['Maelbrume', 170, 3, [['Crash', 2, 1, 60], ['Thunderhead', 3, 2, 110, 'heal:20']]]
    ]],
    [3, 'Skysear', [
      ['Cloudmite', 50, 1, [['Prickle', 1, 1, 20]]],
      ['Nimbufang', 80, 1, [['Flash Bite', 1, 1, 20, 'heal:10'], ['Skysear', 2, 2, 60, 'recoil:20']]],
      ['Levinjaw', 150, 3, [['Rend', 2, 1, 70], ['Stormbreak', 3, 2, 120, 'recoil:30']]]
    ]],
    [3, 'Aurorine', [
      ['Glimmerfly', 60, 1, [['Flicker', 1, 0, 10]]],
      ['Aurorine', 90, 1, [['Shimmer', 1, 1, 30], ['Static Veil', 2, 1, 40, 'shield:20']]],
      ['Skywarden', 140, 2, [['Ion Lash', 2, 1, 60, 'stall'], ['Aurora Bind', 3, 2, 100, 'draw']]]
    ]]
  ];

  var CARDS = [];
  var i, j, ln, cr, atk, a, list;

  for (i = 0; i < LINES.length; i++) {
    ln = LINES[i];
    for (j = 0; j < 3; j++) {
      cr = ln[2][j];
      list = [];
      for (a = 0; a < cr[3].length; a++) {
        atk = cr[3][a];
        list.push({ n: atk[0], c: atk[1], m: atk[2], d: atk[3], x: atk[4] || null });
      }
      CARDS.push({
        i: CARDS.length, n: cr[0], t: 'c', e: ln[0], s: j + 1,
        ev: j === 0 ? -1 : CARDS.length - 1,
        line: ln[1], hp: cr[1], rt: cr[2], a: list, r: j
      });
    }
  }
  var CREATURE_COUNT = CARDS.length;

  // ---------------- HANDLERS (trainer and item cards, original framing) ------
  var HANDLERS = [
    ['Handler Rell', 'DRAW2', 'Draw 2 cards.', 1],
    ['Field Medic Ova', 'HEAL30', 'Heal 30 damage from your Active.', 1],
    ['Beacon Ives', 'EXTRA_E', 'Attach one extra energy this turn.', 1],
    ['Whistler Tarn', 'GUST', 'Opponent swaps Active with a benched beast.', 1],
    ['Scout Peya', 'SEARCH', 'Pull a Stage 1 beast from your deck.', 1],
    ['Coach Bram', 'BOOST20', 'Your attacks do 20 more damage this turn.', 1],
    ['Bulwark Kit', 'SHIELD20', 'Your Active takes 20 less damage next turn.', 1],
    ['Salvage Crate', 'RECYCLE', 'Shuffle 2 cards from your discard into your deck.', 1],
    ['Trailguide Nim', 'SCOUT', 'Draw 1 card and heal 20.', 1],
    ['Mentor Dax', 'QUICKEVO', 'Evolve freely this turn, even same-turn arrivals.', 1],
    ['Swap Sigil', 'SWAPSELF', 'Switch your Active with a bench slot for free.', 1],
    ['Overdrive Vial', 'BOOST40', 'Discard an energy: attacks do 40 more this turn.', 1],
    ['Ley Anchor', 'REBIND', 'Move one energy between your beasts.', 2],
    ['Archivist Sel', 'DRAW3', 'Draw 3 cards.', 2],
    ['Field Tent', 'HEAL60', 'Heal 60 damage from your Active.', 2]
  ];

  for (i = 0; i < HANDLERS.length; i++) {
    CARDS.push({
      i: CARDS.length, n: HANDLERS[i][0], t: 'h', e: -1, s: 0, ev: -1,
      line: 'Handler', hp: 0, rt: 0, a: [],
      fx: HANDLERS[i][1], text: HANDLERS[i][2], r: HANDLERS[i][3]
    });
  }

  // index by rarity for pack rolls
  var BY_RAR = [[], [], []];
  for (i = 0; i < CARDS.length; i++) BY_RAR[CARDS[i].r].push(i);

  var NAME_INDEX = {};
  for (i = 0; i < CARDS.length; i++) NAME_INDEX[CARDS[i].n] = i;
  function byName(n) { return NAME_INDEX[n] === undefined ? -1 : NAME_INDEX[n]; }

  // ---------------- STARTER COLLECTION ----------------
  function starterCollection() {
    var col = {};
    var add = function (n, c) { var k = byName(n); if (k >= 0) col[k] = Math.min(2, (col[k] || 0) + c); };
    for (var k = 0; k < CARDS.length; k++) if (CARDS[k].t === 'c' && CARDS[k].s === 1) col[k] = 2;
    ['Blazehound', 'Mistdancer', 'Vinewhelp', 'Windrake'].forEach(function (n) { add(n, 2); });
    ['Flarewing', 'Wavecrest', 'Fernclaw', 'Boltmane'].forEach(function (n) { add(n, 1); });
    ['Pyrewarden', 'Tidewraith', 'Thornlord', 'Tempestrix'].forEach(function (n) { add(n, 1); });
    ['Handler Rell', 'Field Medic Ova', 'Beacon Ives'].forEach(function (n) { add(n, 2); });
    return col;
  }

  // ---------------- GAUNTLET LADDER ----------------
  function deck(names) {
    var d = [];
    for (var k = 0; k < names.length; k++) {
      var id2 = byName(names[k][0]);
      if (id2 < 0) continue;
      for (var q = 0; q < names[k][1]; q++) d.push(id2);
    }
    return d;
  }

  // skill: 0..1 drives AI planning depth and mistake rate.
  var LADDER = [
    {
      n: 'Sprout Circuit', el: 2, arch: 'Swarm', skill: 0.12,
      tell: 'Floods the bench with Stage 1s and never retreats.',
      ai: { bench: 1.6, retreat: 0, evolve: 0.7, big: 0.6 },
      d: deck([['Seedling', 2], ['Mossnib', 2], ['Sporelet', 2], ['Budbeetle', 2], ['Dewsprite', 2],
      ['Vinewhelp', 2], ['Fernclaw', 2], ['Fungalope', 2], ['Handler Rell', 2], ['Scout Peya', 2]])
    },
    {
      n: 'Kindling Camp', el: 0, arch: 'Aggro', skill: 0.2,
      tell: 'All in Ember hitters. Attacks the turn it can, ignores defense.',
      ai: { bench: 0.8, retreat: 0.2, evolve: 1.1, big: 1.3 },
      d: deck([['Cinderpup', 2], ['Kindlebug', 2], ['Sparkfoal', 2], ['Embermoth', 2],
      ['Blazehound', 2], ['Torchbeetle', 2], ['Flamestride', 2], ['Pyrewarden', 2],
      ['Coach Bram', 2], ['Beacon Ives', 2]])
    },
    {
      n: 'Gale Scouts', el: 3, arch: 'Tempo', skill: 0.28,
      tell: 'Cheap Storm attackers that trade early and keep the pressure on.',
      ai: { bench: 1.2, retreat: 0.5, evolve: 1.0, big: 0.9 },
      d: deck([['Zephyrkit', 2], ['Sparkfawn', 2], ['Cloudmite', 2], ['Glimmerfly', 2],
      ['Windrake', 2], ['Boltmane', 2], ['Nimbufang', 2], ['Aurorine', 2],
      ['Handler Rell', 2], ['Beacon Ives', 2]])
    },
    {
      n: 'Bramble Wardens', el: 2, arch: 'Tank', skill: 0.34,
      tell: 'Huge HP and constant healing. Bring damage, not chip.',
      ai: { bench: 1.0, retreat: 0.5, evolve: 1.2, big: 0.9 },
      d: deck([['Spineburr', 2], ['Budbeetle', 2], ['Seedling', 2], ['Pebblefin', 2],
      ['Bramblehide', 2], ['Petalguard', 2], ['Barkbehemoth', 2], ['Bloomtitan', 2],
      ['Field Tent', 2], ['Trailguide Nim', 2]])
    },
    {
      n: 'Emberfall Rush', el: 0, arch: 'Ramp', skill: 0.4,
      tell: 'Evolves a turn early with Mentor Dax and swings big.',
      ai: { bench: 1.1, retreat: 0.4, evolve: 1.6, big: 1.2 },
      d: deck([['Ashkit', 2], ['Cinderpup', 2], ['Kindlebug', 2], ['Sparkfoal', 2],
      ['Sootpaw', 2], ['Blazehound', 2], ['Cindermaw', 2], ['Magmabore', 2],
      ['Mentor Dax', 2], ['Beacon Ives', 2]])
    },
    {
      n: 'Riptide Syndicate', el: 1, arch: 'Disrupt', skill: 0.46,
      tell: 'Gusts your bench forward and punishes the beast you were charging.',
      ai: { bench: 1.2, retreat: 0.8, evolve: 1.2, big: 1.1 },
      d: deck([['Brinehatch', 2], ['Puddlepod', 2], ['Dewsprite', 2], ['Frostmite', 2],
      ['Wavecrest', 2], ['Streamcoil', 2], ['Maelstrider', 2], ['Riptidon', 2],
      ['Whistler Tarn', 2], ['Archivist Sel', 2]])
    },
    {
      n: 'Voltmane Circuit', el: 3, arch: 'Spread', skill: 0.52,
      tell: 'Chips your whole bench, then finishes two beasts in one turn.',
      ai: { bench: 1.3, retreat: 0.5, evolve: 1.3, big: 1.2 },
      d: deck([['Sparkfawn', 2], ['Zephyrkit', 2], ['Gustling', 2], ['Cloudmite', 2],
      ['Boltmane', 2], ['Windrake', 2], ['Thunderhoof', 2], ['Squallshell', 2],
      ['Coach Bram', 2], ['Handler Rell', 2]])
    },
    {
      n: 'Deepwater Vigil', el: 1, arch: 'Control', skill: 0.58,
      tell: 'Stacks shields and freezes. Wins by outlasting you.',
      ai: { bench: 1.0, retreat: 0.6, evolve: 1.0, big: 0.8 },
      d: deck([['Frostmite', 2], ['Dewsprite', 2], ['Brinehatch', 2], ['Puddlepod', 2],
      ['Glacierling', 2], ['Mistdancer', 2], ['Streamcoil', 2], ['Rimecolossus', 2],
      ['Bulwark Kit', 2], ['Field Medic Ova', 2]])
    },
    {
      n: 'Sootclaw Bruisers', el: 0, arch: 'Midrange', skill: 0.62,
      tell: 'Heavy Ember bodies that heal back what you chip off.',
      ai: { bench: 1.0, retreat: 0.7, evolve: 1.3, big: 1.2 },
      d: deck([['Ashkit', 2], ['Kindlebug', 2], ['Sparkfoal', 2], ['Cinderpup', 2],
      ['Sootpaw', 2], ['Torchbeetle', 2], ['Cindermaw', 2], ['Infernomane', 2],
      ['Field Tent', 2], ['Ley Anchor', 2]])
    },
    {
      n: 'Thornspire Order', el: 2, arch: 'Bomb', skill: 0.66,
      tell: 'Sandbags energy, then drops a 3 cost finisher out of nowhere.',
      ai: { bench: 0.9, retreat: 0.5, evolve: 1.3, big: 1.8 },
      d: deck([['Seedling', 2], ['Mossnib', 2], ['Sporelet', 2], ['Spineburr', 2],
      ['Vinewhelp', 2], ['Grovekeeper', 2], ['Thornlord', 2], ['Mycelarch', 2],
      ['Overdrive Vial', 2], ['Ley Anchor', 2]])
    },
    {
      n: 'Skysear Vanguard', el: 3, arch: 'Burst', skill: 0.72,
      tell: 'Trades its own health for enormous single swings.',
      ai: { bench: 0.9, retreat: 0.4, evolve: 1.5, big: 1.7 },
      d: deck([['Cloudmite', 2], ['Zephyrkit', 2], ['Sparkfawn', 2], ['Gustling', 2],
      ['Nimbufang', 2], ['Windrake', 2], ['Levinjaw', 2], ['Tempestrix', 2],
      ['Overdrive Vial', 2], ['Field Medic Ova', 2]])
    },
    {
      n: 'Rimehold Wardens', el: 1, arch: 'Lock', skill: 0.78,
      tell: 'Binds your Active turn after turn and never lets you swing.',
      ai: { bench: 1.1, retreat: 0.9, evolve: 1.2, big: 1.0 },
      d: deck([['Frostmite', 2], ['Puddlepod', 2], ['Pebblefin', 2], ['Dewsprite', 2],
      ['Glacierling', 2], ['Coralfang', 2], ['Rimecolossus', 2], ['Abyssjaw', 2],
      ['Bulwark Kit', 2], ['Swap Sigil', 2]])
    },
    {
      n: 'Aurorine Choir', el: 3, arch: 'Bind', skill: 0.84,
      tell: 'Shields, binds, and draws. It plays a long, exact game.',
      ai: { bench: 1.2, retreat: 0.9, evolve: 1.3, big: 1.1 },
      d: deck([['Glimmerfly', 2], ['Sparkfawn', 2], ['Cloudmite', 2], ['Zephyrkit', 2],
      ['Aurorine', 2], ['Boltmane', 2], ['Skywarden', 2], ['Maelbrume', 2],
      ['Archivist Sel', 2], ['Bulwark Kit', 2]])
    },
    {
      n: 'Ashen Congress', el: 0, arch: 'Grind', skill: 0.9,
      tell: 'Recycles its discard forever. You cannot deck it out.',
      ai: { bench: 1.2, retreat: 0.8, evolve: 1.4, big: 1.3 },
      d: deck([['Cinderpup', 2], ['Ashkit', 2], ['Embermoth', 2], ['Kindlebug', 2],
      ['Blazehound', 2], ['Sootpaw', 2], ['Pyrewarden', 2], ['Solarch', 2],
      ['Salvage Crate', 2], ['Archivist Sel', 2]])
    },
    {
      n: 'Warden of the Bind', el: -1, arch: 'Champion', skill: 1,
      tell: 'Every faction, every trick. No tell, it just plays well.',
      ai: { bench: 1.2, retreat: 0.9, evolve: 1.4, big: 1.4 },
      d: deck([['Cinderpup', 2], ['Dewsprite', 2], ['Seedling', 1], ['Zephyrkit', 2],
      ['Embermoth', 1], ['Frostmite', 1], ['Sparkfawn', 1],
      ['Blazehound', 1], ['Mistdancer', 1], ['Windrake', 1],
      ['Pyrewarden', 2], ['Rimecolossus', 1], ['Thornlord', 1], ['Tempestrix', 1],
      ['Coach Bram', 1], ['Field Tent', 1]])
    }
  ];

  // ---------------- PACK RATES (posted verbatim in the UI) ----------------
  var PACK_RATES = {
    slots: [
      { label: 'Cards 1 to 3', rows: [['Common', 100]] },
      { label: 'Card 4', rows: [['Uncommon', 75], ['Rare', 25]] },
      { label: 'Card 5', rows: [['Common', 50], ['Uncommon', 32], ['Rare', 18]] }
    ]
  };
  var CLAIM_COST = 5;   // dust credits to claim any missing card
  var WINS_PER_PACK = 2;

  // ---------------- DRAFT ----------------
  // 10 picks of 1 of 3 bundles, 2 copies each, first 3 picks are Stage 1 only.
  var DRAFT_PICKS = 10;
  var DRAFT_COPIES = 2;
  var DRAFT_BASIC_PICKS = 3;

  var BASIC_IDS = [], EVO_IDS = [], HANDLER_IDS = [];
  for (i = 0; i < CARDS.length; i++) {
    if (CARDS[i].t === 'h') HANDLER_IDS.push(i);
    else if (CARDS[i].s === 1) BASIC_IDS.push(i);
    else EVO_IDS.push(i);
  }

  // Evolution chain lookup, guarded: chainOf(basicId) -> [stage1, stage2, stage3]
  var CHAIN = {};
  for (i = 0; i < CREATURE_COUNT; i++) {
    if (CARDS[i].s !== 1) continue;
    var chain = [i];
    var cursor = i;
    for (j = 0; j < CREATURE_COUNT; j++) {
      if (CARDS[j].t === 'c' && CARDS[j].ev === cursor) { chain.push(j); cursor = j; j = -1; }
      if (chain.length >= 3) break;
    }
    CHAIN[i] = chain;
  }
  function chainOf(id) {
    var c = CARDS[id];
    if (!c || c.t !== 'c') return [];
    var head = id;
    var guard = 0;
    while (CARDS[head] && CARDS[head].ev >= 0 && guard++ < 8) head = CARDS[head].ev;
    return CHAIN[head] || [head];
  }

  var LINE_INDEX = {};
  for (i = 0; i < CREATURE_COUNT; i++) {
    var key = CARDS[i].e + '|' + CARDS[i].line;
    (LINE_INDEX[key] = LINE_INDEX[key] || []).push(i);
  }

  root.BB_CARDS = {
    EL: EL, EL_SHORT: EL_SHORT, EL_COL: EL_COL, EL_LIGHT: EL_LIGHT, EL_DIM: EL_DIM,
    EL_GLYPH: EL_GLYPH, WEAK_TO: WEAK_TO,
    RAR: RAR, RAR_COL: RAR_COL, CARDS: CARDS, BY_RAR: BY_RAR, LADDER: LADDER,
    PACK_RATES: PACK_RATES, CLAIM_COST: CLAIM_COST, WINS_PER_PACK: WINS_PER_PACK,
    DRAFT_PICKS: DRAFT_PICKS, DRAFT_COPIES: DRAFT_COPIES, DRAFT_BASIC_PICKS: DRAFT_BASIC_PICKS,
    BASIC_IDS: BASIC_IDS, EVO_IDS: EVO_IDS, HANDLER_IDS: HANDLER_IDS,
    LINE_INDEX: LINE_INDEX, chainOf: chainOf,
    starterCollection: starterCollection, byName: byName,
    CREATURE_COUNT: CREATURE_COUNT, SET_SIZE: CARDS.length
  };
})(window);
