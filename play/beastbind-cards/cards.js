/* Beastbind Cards - original card set (60). No borrowed names or trade dress. */
(function (root) {
  'use strict';

  // Elements: 0 Ember, 1 Tide, 2 Bramble
  var EL = ['Ember', 'Tide', 'Bramble'];
  var EL_COL = ['#e2603a', '#3d8fd0', '#4fa35c'];
  var EL_DIM = ['#5a2a1c', '#1b3c56', '#204227'];
  var EL_GLYPH = ['▲', '●', '◆'];
  // weakTo[defenderElement] = element that deals double to it
  var WEAK_TO = [1, 2, 0];

  var RAR = ['Common', 'Uncommon', 'Rare'];
  var RAR_COL = ['#9aa3ad', '#63b7d8', '#e0b34a'];

  // line data: [name, hp, retreat, attacks]
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
    // ---------------- BRAMBLE ----------------
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
    ]]
  ];

  var CARDS = [];
  var i, j, ln, cr, atk, a, list, id;

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

  // ---------------- HANDLERS (trainer-style support, original framing) ----------
  // effect codes handled by the engine
  var HANDLERS = [
    ['Handler Rell', 'DRAW2', 'Draw 2 cards.', 1],
    ['Field Medic Ova', 'HEAL30', 'Heal 30 damage from your Active.', 1],
    ['Beacon Ives', 'EXTRA_E', 'Attach one extra energy this turn.', 1],
    ['Whistler Tarn', 'GUST', 'Opponent swaps Active with a benched creature.', 1],
    ['Scout Peya', 'SEARCH', 'Pull a Stage 1 creature from your deck.', 1],
    ['Coach Bram', 'BOOST20', 'Your attacks do +20 damage this turn.', 1],
    ['Bulwark Kit', 'SHIELD20', 'Your Active takes 20 less damage next turn.', 1],
    ['Salvage Crate', 'RECYCLE', 'Shuffle 2 cards from your discard into your deck.', 1],
    ['Trailguide Nim', 'SCOUT', 'Draw 1 card and heal 20.', 1],
    ['Mentor Dax', 'QUICKEVO', 'Evolve freely this turn, even same-turn arrivals.', 1],
    ['Swap Sigil', 'SWAPSELF', 'Switch your Active with a bench slot for free.', 1],
    ['Overdrive Vial', 'BOOST40', 'Discard an energy: attacks do +40 this turn.', 1],
    ['Ley Anchor', 'REBIND', 'Move one energy between your creatures.', 2],
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

  function byName(n) {
    for (var k = 0; k < CARDS.length; k++) if (CARDS[k].n === n) return k;
    return -1;
  }

  // ---------------- STARTER COLLECTION ----------------
  function starterCollection() {
    var col = {};
    var add = function (n, c) { var k = byName(n); if (k >= 0) col[k] = (col[k] || 0) + c; };
    // two of every Stage 1
    for (var k = 0; k < CARDS.length; k++) if (CARDS[k].t === 'c' && CARDS[k].s === 1) col[k] = 2;
    // a working spine for each element
    ['Blazehound', 'Mistdancer', 'Vinewhelp'].forEach(function (n) { add(n, 2); });
    ['Flarewing', 'Wavecrest', 'Fernclaw'].forEach(function (n) { add(n, 1); });
    ['Pyrewarden', 'Tidewraith', 'Thornlord'].forEach(function (n) { add(n, 1); });
    ['Handler Rell', 'Field Medic Ova', 'Beacon Ives'].forEach(function (n) { add(n, 2); });
    return col;
  }

  // ---------------- AI LADDER ----------------
  // tell = the archetype signature the player can read before/while playing
  function deck(names) {
    var d = [];
    for (var k = 0; k < names.length; k++) {
      var id2 = byName(names[k][0]);
      for (var q = 0; q < names[k][1]; q++) d.push(id2);
    }
    return d;
  }

  var LADDER = [
    {
      n: 'Sprout Circuit', el: 2, arch: 'Swarm',
      tell: 'Floods the bench with Stage 1s and never retreats.',
      ai: { bench: 1.6, retreat: 0, evolve: 0.7, big: 0.6 },
      d: deck([['Seedling', 2], ['Mossnib', 2], ['Sporelet', 2], ['Budbeetle', 2], ['Dewsprite', 2],
      ['Vinewhelp', 2], ['Fernclaw', 2], ['Fungalope', 2], ['Handler Rell', 2], ['Scout Peya', 2]])
    },
    {
      n: 'Kindling Camp', el: 0, arch: 'Aggro',
      tell: 'All-in Ember hitters. Attacks the turn it can, ignores defense.',
      ai: { bench: 0.8, retreat: 0.2, evolve: 1.1, big: 1.3 },
      d: deck([['Cinderpup', 2], ['Kindlebug', 2], ['Sparkfoal', 2], ['Embermoth', 2],
      ['Blazehound', 2], ['Torchbeetle', 2], ['Flamestride', 2], ['Pyrewarden', 2],
      ['Coach Bram', 2], ['Beacon Ives', 2]])
    },
    {
      n: 'Bramble Wardens', el: 2, arch: 'Tank',
      tell: 'Huge HP and constant healing. Bring damage, not chip.',
      ai: { bench: 1.0, retreat: 0.5, evolve: 1.2, big: 0.9 },
      d: deck([['Spineburr', 2], ['Budbeetle', 2], ['Seedling', 2], ['Pebblefin', 2],
      ['Bramblehide', 2], ['Petalguard', 2], ['Barkbehemoth', 2], ['Bloomtitan', 2],
      ['Field Tent', 2], ['Trailguide Nim', 2]])
    },
    {
      n: 'Emberfall Rush', el: 0, arch: 'Ramp',
      tell: 'Evolves a turn early with Mentor Dax and swings big.',
      ai: { bench: 1.1, retreat: 0.4, evolve: 1.6, big: 1.2 },
      d: deck([['Ashkit', 2], ['Cinderpup', 2], ['Kindlebug', 2], ['Sparkfoal', 2],
      ['Sootpaw', 2], ['Blazehound', 2], ['Cindermaw', 2], ['Magmabore', 2],
      ['Mentor Dax', 2], ['Beacon Ives', 2]])
    },
    {
      n: 'Riptide Syndicate', el: 1, arch: 'Disrupt',
      tell: 'Gusts your bench forward and punishes the creature you were charging.',
      ai: { bench: 1.2, retreat: 0.8, evolve: 1.2, big: 1.1 },
      d: deck([['Brinehatch', 2], ['Puddlepod', 2], ['Dewsprite', 2], ['Frostmite', 2],
      ['Wavecrest', 2], ['Streamcoil', 2], ['Maelstrider', 2], ['Riptidon', 2],
      ['Whistler Tarn', 2], ['Archivist Sel', 2]])
    },
    {
      n: 'Deepwater Vigil', el: 1, arch: 'Control',
      tell: 'Stacks shields and freezes. Wins by outlasting you.',
      ai: { bench: 1.0, retreat: 0.6, evolve: 1.0, big: 0.8 },
      d: deck([['Frostmite', 2], ['Dewsprite', 2], ['Brinehatch', 2], ['Puddlepod', 2],
      ['Glacierling', 2], ['Mistdancer', 2], ['Streamcoil', 2], ['Rimecolossus', 2],
      ['Bulwark Kit', 2], ['Field Medic Ova', 2]])
    },
    {
      n: 'Thornspire Order', el: 2, arch: 'Bomb',
      tell: 'Sandbags energy, then drops a 3-cost finisher out of nowhere.',
      ai: { bench: 0.9, retreat: 0.5, evolve: 1.3, big: 1.8 },
      d: deck([['Seedling', 2], ['Mossnib', 2], ['Sporelet', 2], ['Spineburr', 2],
      ['Vinewhelp', 2], ['Grovekeeper', 2], ['Thornlord', 2], ['Mycelarch', 2],
      ['Overdrive Vial', 2], ['Ley Anchor', 2]])
    },
    {
      n: 'Warden of the Bind', el: -1, arch: 'Champion',
      tell: 'Every element, every trick. No tell - it just plays well.',
      ai: { bench: 1.2, retreat: 0.9, evolve: 1.4, big: 1.4 },
      d: deck([['Cinderpup', 2], ['Dewsprite', 2], ['Seedling', 2], ['Embermoth', 1], ['Frostmite', 1],
      ['Blazehound', 2], ['Mistdancer', 1], ['Grovekeeper', 1],
      ['Pyrewarden', 2], ['Rimecolossus', 1], ['Thornlord', 1],
      ['Coach Bram', 1], ['Field Tent', 1], ['Whistler Tarn', 1], ['Archivist Sel', 1]])
    }
  ];

  // ---------------- PACK RATES (posted verbatim in the UI) ----------------
  var PACK_RATES = {
    slots: [
      { label: 'Cards 1-3', rows: [['Common', 100]] },
      { label: 'Card 4', rows: [['Uncommon', 75], ['Rare', 25]] },
      { label: 'Card 5', rows: [['Common', 50], ['Uncommon', 32], ['Rare', 18]] }
    ],
    table: [[[1, 0, 0]], [[0, 0.75, 0.25]], [[0.5, 0.32, 0.18]]]
  };
  var CLAIM_COST = 5; // credits to claim any missing card (full set lands near 60 wins)

  root.BB_CARDS = {
    EL: EL, EL_COL: EL_COL, EL_DIM: EL_DIM, EL_GLYPH: EL_GLYPH, WEAK_TO: WEAK_TO,
    RAR: RAR, RAR_COL: RAR_COL, CARDS: CARDS, BY_RAR: BY_RAR, LADDER: LADDER,
    PACK_RATES: PACK_RATES, CLAIM_COST: CLAIM_COST, starterCollection: starterCollection, byName: byName,
    SET_SIZE: CARDS.length
  };
})(window);
