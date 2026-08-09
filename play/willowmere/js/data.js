/* Willowmere - data: items, fish, furniture/recipes, npcs, stories */
'use strict';

var ITEMS = {
  reed: { n: 'Reed', c: '#93bb6d' },
  driftwood: { n: 'Driftwood', c: '#b08e69' },
  clay: { n: 'River Clay', c: '#bd7a58' },
  lakestone: { n: 'Lakestone', c: '#94a2af' },
  pinecone: { n: 'Pinecone', c: '#8a6440' },
  glowmoss: { n: 'Glowmoss', c: '#78e2c1' },
  honeycap: { n: 'Honeycap', c: '#e2a850' },
  berry: { n: 'Dewberry', c: '#c75f92' },
  amberleaf: { n: 'Amberleaf', c: '#e5813a' },
  silverfin: { n: 'Silverfin', c: '#cfe2ee', f: 1 },
  sunperch: { n: 'Sunperch', c: '#f2c451', f: 1 },
  ribbonfish: { n: 'Ribbonfish', c: '#7cc3e4', f: 1 },
  emberscale: { n: 'Emberscale', c: '#e56d4c', f: 1 },
  duskcarp: { n: 'Duskcarp', c: '#9f80c6', f: 1 },
  lanternfish: { n: 'Lanternfish', c: '#ffe391', f: 1 }
};

/* fish: id, speed of the reel marker, width of the sweet zone, hits needed */
var FISH = {
  silverfin: { spd: 0.95, zone: 0.30, hits: 3 },
  sunperch: { spd: 1.15, zone: 0.26, hits: 3 },
  ribbonfish: { spd: 1.35, zone: 0.22, hits: 3 },
  emberscale: { spd: 1.25, zone: 0.24, hits: 4 },
  duskcarp: { spd: 1.5, zone: 0.20, hits: 4 },
  lanternfish: { spd: 1.75, zone: 0.17, hits: 4 }
};
function fishPool(season, night) {
  if (season === 0) return night ? ['ribbonfish', 'ribbonfish', 'silverfin', 'lanternfish'] : ['silverfin', 'silverfin', 'sunperch', 'sunperch', 'ribbonfish'];
  return night ? ['duskcarp', 'duskcarp', 'emberscale', 'lanternfish'] : ['emberscale', 'emberscale', 'duskcarp', 'silverfin'];
}

/* 16 furniture pieces. 12 have recipes (bench). 4 are friendship-story rewards. */
var FURN = [
  { id: 'mat', n: 'Reed Mat', w: 66, h: 44, sh: 'flat', a: '#9db06a', b: '#7b8d50', r: { reed: 3 } },
  { id: 'stool', n: 'Driftwood Stool', w: 30, h: 30, sh: 'round', a: '#b39271', b: '#8a6c50', r: { driftwood: 2, reed: 1 } },
  { id: 'lantern', n: 'Clay Lantern', w: 24, h: 34, sh: 'lamp', a: '#c08160', b: '#ffe6a0', r: { clay: 2, glowmoss: 1 } },
  { id: 'shelf', n: 'Pine Shelf', w: 64, h: 26, sh: 'box', a: '#a3855f', b: '#6f5940', r: { driftwood: 3, pinecone: 2 } },
  { id: 'hearth', n: 'Stone Hearth', w: 74, h: 42, sh: 'box', a: '#8e9aa6', b: '#e08a4a', r: { lakestone: 4, clay: 1 } },
  { id: 'trophy', n: "Angler's Trophy", w: 40, h: 28, sh: 'box', a: '#cfe0ea', b: '#7a6a50', r: { silverfin: 1, lakestone: 2 } },
  { id: 'table', n: 'Willow Table', w: 74, h: 48, sh: 'box', a: '#b39468', b: '#8a6c50', r: { driftwood: 3, reed: 2 } },
  { id: 'rug', n: 'Moss Rug', w: 86, h: 60, sh: 'flat', a: '#6fbf9a', b: '#4e9b79', r: { glowmoss: 3, reed: 2 } },
  { id: 'screen', n: 'Amber Screen', w: 58, h: 62, sh: 'tall', a: '#e0913a', b: '#a8652a', r: { amberleaf: 4, driftwood: 2 } },
  { id: 'mirror', n: 'Lake Mirror', w: 34, h: 46, sh: 'tall', a: '#9fc4d8', b: '#6f8fa6', r: { lakestone: 2, clay: 2, glowmoss: 1 } },
  { id: 'honeylamp', n: 'Honey Lamp', w: 26, h: 36, sh: 'lamp', a: '#d0a050', b: '#ffd88a', r: { honeycap: 2, clay: 2 } },
  { id: 'bedroll', n: 'Cozy Bedroll', w: 60, h: 38, sh: 'flat', a: '#c08aa0', b: '#96637a', r: { reed: 3, amberleaf: 2 } },
  { id: 'armchair', n: 'Quilted Armchair', w: 46, h: 46, sh: 'box', a: '#c06a7a', b: '#8a4a58', story: 1 },
  { id: 'wheel', n: 'Harbor Wheel', w: 46, h: 46, sh: 'round', a: '#9a7a52', b: '#6a5238', story: 1 },
  { id: 'garland', n: 'Festival Garland', w: 88, h: 22, sh: 'flat', a: '#e0c060', b: '#c0803a', story: 1 },
  { id: 'banner', n: 'Starlit Banner', w: 34, h: 66, sh: 'tall', a: '#5f6fc4', b: '#e8e0a0', story: 1 }
];
var RECIPES = FURN.filter(function (f) { return !!f.r; });
function furnById(id) { for (var i = 0; i < FURN.length; i++) if (FURN[i].id === id) return FURN[i]; return null; }

var STYLES = {
  wall: [{ id: 'plaster', n: 'Plaster', c: '#d8cdb6', c2: '#c2b59c' },
  { id: 'amberwash', n: 'Amberwash', c: '#e6c295', c2: '#cfa571' }],
  floor: [{ id: 'pine', n: 'Pine Board', c: '#b9925f', c2: '#a8834f' },
  { id: 'lakewood', n: 'Lakewood', c: '#8fa8a2', c2: '#7d968f' }]
};

/* 6 NPCs. spots: [morning, day, evening, night] world coords. */
var NPCS = [
  {
    id: 'maple', n: 'Maple Thorne', role: 'baker', c: '#e07a8a', h: '#5b3324',
    loves: 'honeycap', likes: 'berry', hates: 'lakestone',
    spots: [[135, 748], [300, 786], [392, 700], [135, 740]],
    greet: ['Ovens are hot and the town smells like morning. Take your time.',
      'You always turn up right when the buns come out. Lucky, you.',
      "You're family at this counter now. That's a fact, not a favour."],
    s1: [{ w: 'Maple', t: 'Careful, that tray is hotter than the dock at noon.' },
    { w: 'Maple', t: 'My gran ran this bakery. I kept her stool and threw out her recipes.' },
    { w: 'You', t: 'That sounds brave.' },
    { w: 'Maple', t: "It was rude. But her honeycap buns were terrible and I have standards." }],
    s2: [{ w: 'Maple', t: "I found her notebook behind the flour bin last night." },
    { w: 'Maple', t: 'Turns out she wrote that she hoped whoever came next would change everything.' },
    { w: 'You', t: 'She knew you.' },
    { w: 'Maple', t: "She did. Here - sit in this while I cry into the dough. It's yours." }],
    rw: { t: 'furn', id: 'armchair' }
  },
  {
    id: 'bram', n: 'Bram Quill', role: 'fisher', c: '#5f9fd0', h: '#22303c',
    loves: 'silverfin', likes: 'driftwood', hates: 'berry',
    spots: [[392, 300], [432, 392], [300, 792], [640, 748]],
    greet: ['Water is flat, fish are honest. Good day for a line.',
      'Saw your bobber from here. Not bad. Not good, but not bad.',
      "You out-fished me Tuesday. I've decided to be gracious about it."],
    s1: [{ w: 'Bram', t: "Thirty years on this lake and it still lies to me." },
    { w: 'You', t: 'Lies how?' },
    { w: 'Bram', t: 'Goes calm when a storm is coming. Goes rough when nothing is.' },
    { w: 'Bram', t: 'Same as people. You learn to read the little ripples instead.' }],
    s2: [{ w: 'Bram', t: 'My old boat wheel has been in the shed since I stopped going out far.' },
    { w: 'You', t: 'Why did you stop?' },
    { w: 'Bram', t: 'Got scared. Then got used to being scared. Then got old.' },
    { w: 'Bram', t: "Rowed to the far reeds this morning, though. Take the wheel - I'd rather steer by hand now." }],
    rw: { t: 'furn', id: 'wheel' }
  },
  {
    id: 'oleo', n: 'Oleander Vane', role: 'herbalist', c: '#7fc79a', h: '#3b4a2c',
    loves: 'glowmoss', likes: 'amberleaf', hates: 'pinecone',
    spots: [[146, 978], [262, 916], [300, 792], [146, 968]],
    greet: ['Mind the drying racks. Everything in here bites a little.',
      'You have steady hands. I could use steady hands.',
      'The shop is better with you tracking mud through it. Truly.'],
    s1: [{ w: 'Oleander', t: 'Glowmoss only shines when the night is properly dark.' },
    { w: 'Oleander', t: 'People are similar. I say that to sound wise. It is mostly about moss.' },
    { w: 'You', t: 'It worked a little.' },
    { w: 'Oleander', t: 'Good. I have three more and they get worse.' }],
    s2: [{ w: 'Oleander', t: 'I came to Willowmere to be alone for one winter. That was nine winters ago.' },
    { w: 'You', t: 'What kept you?' },
    { w: 'Oleander', t: 'Somebody always needed a poultice at an inconvenient hour.' },
    { w: 'Oleander', t: 'Take this amber wash for your walls. It is the colour of staying.' }],
    rw: { t: 'style', k: 'wall', id: 'amberwash' }
  },
  {
    id: 'tansy', n: 'Tansy Ford', role: 'lake kid', c: '#f0c85a', h: '#a05a2a',
    loves: 'berry', likes: 'pinecone', hates: 'clay',
    spots: [[470, 782], [212, 404], [392, 762], [136, 752]],
    greet: ['I am counting every duck on this lake. I am at forty. Or nine.',
      'You want to see my flat rock collection? It is mostly one rock.',
      'Best friend inspection: passed. You may proceed.'],
    s1: [{ w: 'Tansy', t: 'Grown-ups walk past the lake like it is a wall.' },
    { w: 'You', t: 'What is it, then?' },
    { w: 'Tansy', t: 'A door! There are fish under there living whole entire lives.' },
    { w: 'Tansy', t: 'Anyway I am not allowed past the second dock post so I mostly guess.' }],
    s2: [{ w: 'Tansy', t: 'I made a garland for the lantern festival. Nobody asked me to.' },
    { w: 'You', t: 'It is beautiful.' },
    { w: 'Tansy', t: 'I know. Hang it in your cottage so it gets seen by somebody with taste.' },
    { w: 'Tansy', t: 'That is you. In case that was unclear.' }],
    rw: { t: 'furn', id: 'garland' }
  },
  {
    id: 'corvin', n: 'Corvin Reed', role: 'boatwright', c: '#c9885a', h: '#3a2a20',
    loves: 'driftwood', likes: 'lakestone', hates: 'honeycap',
    spots: [[640, 748], [500, 400], [640, 762], [640, 740]],
    greet: ['Mind the shavings. Everything in here is halfway to being a boat.',
      'Hand me that plane? Ah - you already did. Good.',
      'You have got the shop hands now. I am putting you on the sign.'],
    s1: [{ w: 'Corvin', t: 'A hull is just a hundred small decisions that agree with each other.' },
    { w: 'You', t: 'And if one disagrees?' },
    { w: 'Corvin', t: 'Then you swim. That is why I sand slowly.' },
    { w: 'Corvin', t: 'Come by at dusk sometime. The wood sounds different when it is cool.' }],
    s2: [{ w: 'Corvin', t: "I never finished my father's skiff. Sat under a tarp eleven years." },
    { w: 'Corvin', t: 'Pulled the tarp off after you started coming round.' },
    { w: 'You', t: 'Will you finish it?' },
    { w: 'Corvin', t: 'By the festival. Take this banner off my rafters - it should hang somewhere lived-in.' }],
    rw: { t: 'furn', id: 'banner' }
  },
  {
    id: 'juniper', n: 'Juniper Ash', role: 'musician', c: '#a889d8', h: '#2c2340',
    loves: 'amberleaf', likes: 'clay', hates: 'reed',
    spots: [[626, 978], [452, 882], [392, 800], [626, 968]],
    greet: ['I am tuning. I am always tuning. It is a lifestyle.',
      'Sit in. I will play the slow one, it suits the light.',
      'Every song I write lately has a lake in it. That is your fault.'],
    s1: [{ w: 'Juniper', t: 'The hall is empty most nights. I play anyway.' },
    { w: 'You', t: 'For who?' },
    { w: 'Juniper', t: 'The room. Old rooms hold sound like cupped hands.' },
    { w: 'Juniper', t: 'Also for anyone walking past who needs a reason to slow down.' }],
    s2: [{ w: 'Juniper', t: 'I have finished the festival piece. It took two seasons.' },
    { w: 'Juniper', t: 'The middle part is the sound of somebody arriving in a small town.' },
    { w: 'You', t: 'How does it end?' },
    { w: 'Juniper', t: 'They stay. Here - lakewood boards for your floor, so you have something to stay on.' }],
    rw: { t: 'style', k: 'floor', id: 'lakewood' }
  }
];
function npcById(id) { for (var i = 0; i < NPCS.length; i++) if (NPCS[i].id === id) return NPCS[i]; return null; }
