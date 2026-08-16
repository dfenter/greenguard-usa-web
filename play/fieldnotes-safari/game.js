/* Fieldnotes Safari, fleet F18, rank 88.
 * Phaser is the renderer. GGKit owns lifecycle, pointer identity, keyboard,
 * persistence, audio buses, PWA and juice. The simulation is fixed step and
 * fully synthetic: no location, network, purchase or gacha systems exist.
 */
(function () {
  'use strict';

  var W = 390;
  var H = 844;
  var STEP = 1 / 60;
  var MAX_STEPS = 4;
  var MAX_PARTICLES = 84;
  var SAVE_VERSION = 5;
  var TAU = Math.PI * 2;
  var FIELD_TOP = 104;
  var FIELD_BOTTOM = 730;
  var SAVE_KEY = 'fieldnotes-safari';

  var PAL = {
    ink: 0x142d29, deep: 0x0b1d1a, paper: 0xf6f0d7, cream: 0xfff9e5,
    mist: 0xb9d8c1, moss: 0x4f8765, fern: 0x78b77c, sun: 0xf4c66d,
    coral: 0xe77f67, lilac: 0xb9a9e8, water: 0x65b6bb, sky: 0x9dd8d0,
    dune: 0xd9a966, crater: 0x9b8295, white: 0xffffff, charcoal: 0x203c36,
    shadow: 0x071511
  };

  var RARITY = {
    common: { label: 'COMMON', odds: 0.64, band: 0.21, color: '#a8d6a4', rank: 1 },
    uncommon: { label: 'UNCOMMON', odds: 0.50, band: 0.17, color: '#85c9d2', rank: 2 },
    rare: { label: 'RARE', odds: 0.36, band: 0.13, color: '#c1aff2', rank: 3 },
    mythic: { label: 'MYTHIC', odds: 0.24, band: 0.095, color: '#f4c66d', rank: 4 }
  };

  var HABITATS = [
    { id: 'delta', name: 'River Delta', short: 'DELTA', accent: 0x65b6bb, deep: 0x123b3a, ground: 0x315f4f, water: 0x327e8b, stem: 'delta', weather: ['clear', 'rain', 'wind'] },
    { id: 'forest', name: 'Cloud Forest', short: 'CLOUD', accent: 0xb9a9e8, deep: 0x26334b, ground: 0x354d4b, water: 0x527c82, stem: 'forest', weather: ['fog', 'rain', 'clear'] },
    { id: 'dune', name: 'Dune Sea', short: 'DUNES', accent: 0xf4c66d, deep: 0x4b3529, ground: 0x9b683f, water: 0x936f63, stem: 'dune', weather: ['clear', 'wind', 'storm'] },
    { id: 'hollows', name: 'Moss Hollows', short: 'HOLLOWS', accent: 0x8cc98a, deep: 0x1d3a2f, ground: 0x41694d, water: 0x4d8a70, stem: 'hollows', weather: ['rain', 'fog', 'dusk'] },
    { id: 'steppe', name: 'Ember Steppe', short: 'STEPPE', accent: 0xe77f67, deep: 0x492f2c, ground: 0x815442, water: 0x915c53, stem: 'steppe', weather: ['clear', 'storm', 'dusk'] },
    { id: 'crater', name: 'Crater Basin', short: 'CRATER', accent: 0xf1b9d1, deep: 0x302842, ground: 0x5b4c6b, water: 0x725f8f, stem: 'crater', weather: ['fog', 'storm', 'night'] }
  ];
  var HABITAT_BY_ID = {};
  HABITATS.forEach(function (h) { HABITAT_BY_ID[h.id] = h; });

  var WEATHER = [
    { id: 'clear', label: 'CLEAR', glyph: '☼', tint: 0xf4c66d },
    { id: 'rain', label: 'RAIN', glyph: '⋰', tint: 0x83c9d2 },
    { id: 'wind', label: 'WIND', glyph: '≈', tint: 0xb9e7af },
    { id: 'fog', label: 'FOG', glyph: '◌', tint: 0xd1d7df },
    { id: 'storm', label: 'STORM', glyph: 'ϟ', tint: 0xe77f67 },
    { id: 'dusk', label: 'DUSK', glyph: '◐', tint: 0xb9a9e8 },
    { id: 'night', label: 'NIGHT', glyph: '☾', tint: 0x9fb8e5 }
  ];
  var WEATHER_BY_ID = {};
  WEATHER.forEach(function (w) { WEATHER_BY_ID[w.id] = w; });

  var PHASES = [
    { id: 'dawn', label: 'DAWN', tint: 0xe6a56f },
    { id: 'day', label: 'DAY', tint: 0xf4c66d },
    { id: 'dusk', label: 'DUSK', tint: 0xb9a9e8 },
    { id: 'night', label: 'NIGHT', tint: 0x9fb8e5 }
  ];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function finite(v, fallback) { return Number.isFinite(v) ? v : (fallback == null ? 0 : fallback); }
  function whole(v, fallback, max) { return Number.isFinite(v) ? clamp(Math.floor(v), 0, max) : fallback; }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function pct(v) { return Math.round(clamp(v, 0, 1) * 100); }
  function safeId(value, fallback, map) { return map[value] ? value : fallback; }
  function hash(value) { var out = 2166136261; String(value).split('').forEach(function (c) { out ^= c.charCodeAt(0); out = Math.imul(out, 16777619); }); return out >>> 0; }
  function mulberry(seed) { var a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function creature(id, name, habitat, weather, rarity, shape, color, note, chain, stage) {
    return { id: id, name: name, habitat: habitat, weather: weather, rarity: rarity, shape: shape, color: color, note: note, chain: chain, stage: stage, unlockTask: stage === 0 ? -1 : chain };
  }

  /* Six authored spawn tables, ten silhouettes per habitat. Every chain has
   * three forms. The two evolved forms unlock together when its research card
   * is complete, keeping the campaign compact while preserving the graph. */
  var SPECIES = [
    creature('delta-01', 'Siltwhisk', 'delta', 'rain', 'common', 'otter', '#7bc8bd', 'A pebble keeper that listens for water under the reeds.', 0, 0),
    creature('delta-02', 'Siltwhisk Tide', 'delta', 'wind', 'uncommon', 'otter', '#57a7ae', 'Its whiskers map every bend of a flooded channel.', 0, 1),
    creature('delta-03', 'Siltwhisk Crown', 'delta', 'storm', 'rare', 'otter', '#9bd8d0', 'The crown marks the oldest current in the delta.', 0, 2),
    creature('delta-04', 'Reedkip', 'delta', 'clear', 'common', 'frog', '#8bc77e', 'It hides a bright seed beneath one webbed foot.', 1, 0),
    creature('delta-05', 'Reedkip Skipper', 'delta', 'wind', 'uncommon', 'frog', '#5da873', 'It skips from reed to reed without bending a stem.', 1, 1),
    creature('delta-06', 'Reedkip Crown', 'delta', 'rain', 'rare', 'frog', '#b5dc8c', 'A bell-throat call sends ripples to distant pools.', 1, 2),
    creature('delta-07', 'Glimmer Eel', 'delta', 'dusk', 'common', 'eel', '#8acbd2', 'A shy ribbon of blue light under a bridge shadow.', 2, 0),
    creature('delta-08', 'Glimmer Eel Coil', 'delta', 'night', 'uncommon', 'eel', '#5fa5c2', 'It coils around moonlit roots to remember a route.', 2, 1),
    creature('delta-09', 'Glimmer Eel Comet', 'delta', 'storm', 'mythic', 'eel', '#c2d6ff', 'Its wake glows for three heartbeats after a storm.', 2, 2),
    creature('delta-10', 'Mudwing', 'delta', 'clear', 'rare', 'manta', '#d3a77b', 'A small delta ray that glides over mud flats.', 3, 0),

    creature('forest-01', 'Mistral Moth', 'forest', 'fog', 'common', 'moth', '#c7bbef', 'It drinks the fog from a single silver fern.', 4, 0),
    creature('forest-02', 'Mistral Moth Veil', 'forest', 'rain', 'uncommon', 'moth', '#a89bde', 'Its wings fold into a cloud-shaped field mark.', 4, 1),
    creature('forest-03', 'Mistral Moth Halo', 'forest', 'night', 'rare', 'moth', '#e8dcff', 'The halo only opens when the canopy is silent.', 4, 2),
    creature('forest-04', 'Cloudcap', 'forest', 'fog', 'common', 'bird', '#eef0da', 'A round little bird that nests in mossy cloud banks.', 5, 0),
    creature('forest-05', 'Cloudcap Sail', 'forest', 'wind', 'uncommon', 'bird', '#c8d7d4', 'Its crest catches the warm air above the canopy.', 5, 1),
    creature('forest-06', 'Cloudcap Crown', 'forest', 'clear', 'rare', 'bird', '#f4c66d', 'A dawn-colored crown flashes between wet leaves.', 5, 2),
    creature('forest-07', 'Fernfox', 'forest', 'rain', 'common', 'fox', '#d28d82', 'It leaves a spiral in the moss instead of a footprint.', 6, 0),
    creature('forest-08', 'Fernfox Lantern', 'forest', 'dusk', 'uncommon', 'fox', '#b97a91', 'Its tail tips glow when a research trail is nearby.', 6, 1),
    creature('forest-09', 'Fernfox Oracle', 'forest', 'fog', 'mythic', 'fox', '#e3bed0', 'It remembers every observer who moved slowly.', 6, 2),
    creature('forest-10', 'Rainbell', 'forest', 'rain', 'rare', 'beetle', '#79c7bd', 'The shell rings softly when a drop lands on it.', 7, 0),

    creature('dune-01', 'Dunebit', 'dune', 'wind', 'common', 'beetle', '#ddb66e', 'It tunnels beneath a dune and leaves a neat stitch line.', 8, 0),
    creature('dune-02', 'Dunebit Brass', 'dune', 'clear', 'uncommon', 'beetle', '#edc96f', 'Its brass back reflects the safest route through a drift.', 8, 1),
    creature('dune-03', 'Dunebit Sunstar', 'dune', 'storm', 'rare', 'beetle', '#f4e29c', 'A sunstar shell appears just before the first thunder.', 8, 2),
    creature('dune-04', 'Sandskip', 'dune', 'clear', 'common', 'lizard', '#ca9a63', 'It naps beside warm stones with one eye open.', 9, 0),
    creature('dune-05', 'Sandskip Kite', 'dune', 'wind', 'uncommon', 'lizard', '#b67c55', 'A sail of skin lets it skim over loose sand.', 9, 1),
    creature('dune-06', 'Sandskip Mirage', 'dune', 'storm', 'rare', 'lizard', '#f0c18b', 'Its colors blur when the horizon is very far away.', 9, 2),
    creature('dune-07', 'Glassjackal', 'dune', 'dusk', 'common', 'fox', '#c7a293', 'It carries a glassy seed from one oasis to the next.', 10, 0),
    creature('dune-08', 'Glassjackal Echo', 'dune', 'wind', 'uncommon', 'fox', '#aa7e87', 'A second tail shape marks its favorite echo basin.', 10, 1),
    creature('dune-09', 'Glassjackal Moon', 'dune', 'night', 'mythic', 'fox', '#e3cadb', 'Its tracks shimmer for the length of a slow breath.', 10, 2),
    creature('dune-10', 'Sunskate', 'dune', 'clear', 'rare', 'manta', '#e7ae61', 'A desert glider that rides the crest of a sand wave.', 11, 0),

    creature('hollows-01', 'Mossmunk', 'hollows', 'rain', 'common', 'squirrel', '#86bd7e', 'It stores rain beads in a hollow acorn.', 12, 0),
    creature('hollows-02', 'Mossmunk Grove', 'hollows', 'fog', 'uncommon', 'squirrel', '#6a9f71', 'The grove form grows a soft fern ruff.', 12, 1),
    creature('hollows-03', 'Mossmunk Elder', 'hollows', 'night', 'rare', 'squirrel', '#b6d99b', 'It knows which mushrooms are safe for a night watch.', 12, 2),
    creature('hollows-04', 'Puddlebug', 'hollows', 'rain', 'common', 'beetle', '#6fb9a4', 'Tiny feet make a perfect ring in a puddle.', 13, 0),
    creature('hollows-05', 'Puddlebug Drum', 'hollows', 'wind', 'uncommon', 'beetle', '#4f9d91', 'Its shell taps a rhythm before fog arrives.', 13, 1),
    creature('hollows-06', 'Puddlebug Moon', 'hollows', 'dusk', 'rare', 'beetle', '#a4d4bd', 'A moon mark guides it home through wet grass.', 13, 2),
    creature('hollows-07', 'Rootling', 'hollows', 'fog', 'common', 'mole', '#b38272', 'It peeks out when the ground has a story to tell.', 14, 0),
    creature('hollows-08', 'Rootling Braider', 'hollows', 'rain', 'uncommon', 'mole', '#96665f', 'It braids three roots into a quiet trail marker.', 14, 1),
    creature('hollows-09', 'Rootling Keeper', 'hollows', 'night', 'mythic', 'mole', '#d5a89c', 'The keeper form guards an underground spring.', 14, 2),
    creature('hollows-10', 'Lanternslug', 'hollows', 'dusk', 'rare', 'slug', '#d29cc1', 'A warm pin of light under the last leaf.', 15, 0),

    creature('steppe-01', 'Cinderling', 'steppe', 'clear', 'common', 'fox', '#d47f61', 'It warms its paws on stones left by the sun.', 16, 0),
    creature('steppe-02', 'Cinderling Hearth', 'steppe', 'dusk', 'uncommon', 'fox', '#c75e58', 'Its ears glow like banked coals at dusk.', 16, 1),
    creature('steppe-03', 'Cinderling Comet', 'steppe', 'storm', 'rare', 'fox', '#f1a16f', 'It runs only when thunder gives a clear signal.', 16, 2),
    creature('steppe-04', 'Ashfinch', 'steppe', 'wind', 'common', 'bird', '#c6a67e', 'The ashfinch has a tail feather shaped like a leaf.', 17, 0),
    creature('steppe-05', 'Ashfinch Flare', 'steppe', 'clear', 'uncommon', 'bird', '#e7b45e', 'A flare crest signals safe grass after rain.', 17, 1),
    creature('steppe-06', 'Ashfinch Sun', 'steppe', 'storm', 'rare', 'bird', '#f4d08b', 'It turns toward the brightest gap in a storm cloud.', 17, 2),
    creature('steppe-07', 'Basaltback', 'steppe', 'storm', 'common', 'turtle', '#7d746b', 'A patient shell with a warm stone on its back.', 18, 0),
    creature('steppe-08', 'Basaltback Bell', 'steppe', 'dusk', 'uncommon', 'turtle', '#9a7569', 'The bell stone hums when a route is complete.', 18, 1),
    creature('steppe-09', 'Basaltback Crown', 'steppe', 'night', 'mythic', 'turtle', '#c8a5a8', 'A crown of small stones marks an ancient wanderer.', 18, 2),
    creature('steppe-10', 'Flarehorn', 'steppe', 'clear', 'rare', 'deer', '#e69c69', 'A small horned grazer that follows ember grass.', 19, 0),

    creature('crater-01', 'Orbitoad', 'crater', 'fog', 'common', 'frog', '#8ca7b4', 'Its jump traces a tiny orbit over the crater dust.', 20, 0),
    creature('crater-02', 'Orbitoad Ring', 'crater', 'storm', 'uncommon', 'frog', '#7291a4', 'A ring mark appears after a careful observation.', 20, 1),
    creature('crater-03', 'Orbitoad Eclipse', 'crater', 'night', 'rare', 'frog', '#b4b8d7', 'The eclipse form blinks once at the basin finale.', 20, 2),
    creature('crater-04', 'Starling', 'crater', 'night', 'common', 'bird', '#a9a6d8', 'Not a bird from the sky, but a bird from the dust.', 21, 0),
    creature('crater-05', 'Starling Arc', 'crater', 'dusk', 'uncommon', 'bird', '#c3a5d9', 'Its flight makes a clean arc above the rim.', 21, 1),
    creature('crater-06', 'Starling Nova', 'crater', 'storm', 'rare', 'bird', '#f1c4cf', 'A nova crest glints just before the sky clears.', 21, 2),
    creature('crater-07', 'Pumice Pup', 'crater', 'fog', 'common', 'dog', '#c19aa5', 'It pads over hot rock without leaving a mark.', 22, 0),
    creature('crater-08', 'Pumice Pup Hearth', 'crater', 'dusk', 'uncommon', 'dog', '#a47f92', 'Its back holds a pocket of safe warmth.', 22, 1),
    creature('crater-09', 'Pumice Pup Atlas', 'crater', 'night', 'mythic', 'dog', '#d9c4d0', 'The atlas form knows the basin by sound alone.', 22, 2),
    creature('crater-10', 'Basin Wyrm', 'crater', 'storm', 'mythic', 'serpent', '#c58db4', 'A patient wyrm curled around the crater finale.', 23, 0)
  ];
  var SPECIES_BY_ID = {};
  SPECIES.forEach(function (s) { SPECIES_BY_ID[s.id] = s; });
  SPECIES.forEach(function (s) {
    if (s.stage > 0 && s.habitat === 'crater') s.unlockTask = 19;
    if (s.stage > 0 && s.id === 'steppe-10') s.unlockTask = 18;
  });

  var BASE_SPECIES = SPECIES.filter(function (s) { return s.stage === 0; });
  HABITATS.forEach(function (h) { h.spawnTable = SPECIES.filter(function (s) { return s.habitat === h.id; }); });

  var RESEARCH = [
    ['Delta survey', 'photograph', 3, 'delta-01', 'Photograph Siltwhisk 3 times'],
    ['Delta patience', 'catch', 5, 'delta-04', 'Catch Reedkip 5 times'],
    ['Delta moon watch', 'night', 1, 'delta-07', 'Observe Glimmer Eel at night'],
    ['Delta wing study', 'photograph', 3, 'delta-10', 'Photograph Mudwing 3 times'],
    ['Cloud canopy', 'photograph', 3, 'forest-01', 'Photograph Mistral Moth 3 times'],
    ['Cloud listening', 'catch', 5, 'forest-04', 'Catch Cloudcap 5 times'],
    ['Cloud night call', 'night', 1, 'forest-07', 'Observe Fernfox at night'],
    ['Cloud rainbell', 'photograph', 3, 'forest-10', 'Photograph Rainbell 3 times'],
    ['Dune stitchwork', 'catch', 5, 'dune-01', 'Catch Dunebit 5 times'],
    ['Dune mirage', 'photograph', 3, 'dune-04', 'Photograph Sandskip 3 times'],
    ['Dune moon trail', 'night', 1, 'dune-07', 'Observe Glassjackal at night'],
    ['Dune sky study', 'photograph', 3, 'dune-10', 'Photograph Sunskate 3 times'],
    ['Hollow rain', 'catch', 5, 'hollows-01', 'Catch Mossmunk 5 times'],
    ['Hollow drum', 'photograph', 3, 'hollows-04', 'Photograph Puddlebug 3 times'],
    ['Hollow root watch', 'night', 1, 'hollows-07', 'Observe Rootling at night'],
    ['Hollow lantern', 'photograph', 3, 'hollows-10', 'Photograph Lanternslug 3 times'],
    ['Steppe ember', 'catch', 5, 'steppe-01', 'Catch Cinderling 5 times'],
    ['Steppe storm', 'photograph', 3, 'steppe-04', 'Photograph Ashfinch 3 times'],
    ['Steppe night stone', 'night', 1, 'steppe-07', 'Observe Basaltback at night'],
    ['Crater finale', 'photograph', 3, 'crater-01', 'Photograph Orbitoad 3 times']
  ].map(function (row, index) { return { id: index, title: row[0], kind: row[1], target: row[2], speciesId: row[3], copy: row[4], habitat: SPECIES_BY_ID[row[3]].habitat }; });

  var ROUTES = [
    { id: 'pocket', name: 'POCKET TRAIL', length: 6, stamina: 10, unlock: 0, copy: 'Short loop through a familiar habitat.' },
    { id: 'long', name: 'LONG LOOP', length: 10, stamina: 16, unlock: 2, copy: 'Weather shifts and rarer tracks.' },
    { id: 'ridge', name: 'RIDGE CROSSING', length: 14, stamina: 22, unlock: 4, copy: 'A patient climb with mythic signs.' },
    { id: 'crater', name: 'CRATER DESCENT', length: 18, stamina: 28, unlock: 8, copy: 'The authored finale route.' }
  ];

  var AUDIO = {
    musicDelta: 'music-delta', musicCrater: 'music-crater',
    step: 'step', rustle: 'rustle', approach: 'approach', bait: 'bait', lure: 'lure',
    ring: 'ring', throw: 'throw', catch: 'catch', miss: 'miss', flee: 'flee',
    photo: 'photo', journal: 'journal', unlock: 'unlock', boundary: 'boundary'
  };

  function defaultSave() {
    return {
      version: SAVE_VERSION, journal: {}, research: RESEARCH.map(function () { return 0; }),
      unlockedHabitats: ['delta', 'hollows'], routesUnlocked: 1,
      gear: { scope: 0, lure: 1, bait: 6 }, bestScore: 0,
      stamina: 10, savedAt: Date.now()
    };
  }
  function validSave(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== SAVE_VERSION) return false;
    if (!value.journal || typeof value.journal !== 'object' || Array.isArray(value.journal)) return false;
    if (!Array.isArray(value.research) || value.research.length !== RESEARCH.length || value.research.some(function (n, i) { return !Number.isInteger(n) || n < 0 || n > RESEARCH[i].target; })) return false;
    if (!Array.isArray(value.unlockedHabitats) || value.unlockedHabitats.length > HABITATS.length || value.unlockedHabitats.some(function (id) { return !HABITAT_BY_ID[id]; })) return false;
    if (!Number.isInteger(value.routesUnlocked) || value.routesUnlocked < 1 || value.routesUnlocked > ROUTES.length) return false;
    if (!value.gear || !Number.isInteger(value.gear.scope) || value.gear.scope < 0 || value.gear.scope > 3 || !Number.isInteger(value.gear.lure) || value.gear.lure < 0 || value.gear.lure > 1 || !Number.isInteger(value.gear.bait) || value.gear.bait < 0 || value.gear.bait > 99) return false;
    return Object.keys(value.journal).every(function (id) {
      var row = value.journal[id];
      return !!SPECIES_BY_ID[id] && row && typeof row === 'object' && Number.isInteger(row.seen) && row.seen >= 0 && row.seen <= 999 && Number.isInteger(row.caught) && row.caught >= 0 && row.caught <= 999 && Number.isInteger(row.photos) && row.photos >= 0 && row.photos <= 999 && Number.isInteger(row.night) && row.night >= 0 && row.night <= 999 && Number.isFinite(row.bestSize) && row.bestSize >= 0 && row.bestSize <= 999;
    });
  }
  function normalizeSave(raw) {
    var base = defaultSave();
    if (!validSave(raw)) return base;
    var journal = {};
    Object.keys(raw.journal).forEach(function (id) {
      if (SPECIES_BY_ID[id]) {
        var row = raw.journal[id];
        journal[id] = { seen: whole(row.seen, 0, 999), caught: whole(row.caught, 0, 999), photos: whole(row.photos, 0, 999), night: whole(row.night, 0, 999), bestSize: clamp(finite(row.bestSize, 0), 0, 999) };
      }
    });
    var now = Date.now();
    var offline = Math.max(0, Math.floor((now - finite(raw.savedAt, now)) / 120000));
    return {
      version: SAVE_VERSION, journal: journal,
      research: RESEARCH.map(function (task, i) { return whole(raw.research[i], 0, task.target); }),
      unlockedHabitats: raw.unlockedHabitats.filter(function (id, i, list) { return !!HABITAT_BY_ID[id] && list.indexOf(id) === i; }),
      routesUnlocked: whole(raw.routesUnlocked, 1, ROUTES.length),
      gear: { scope: whole(raw.gear.scope, 0, 3), lure: whole(raw.gear.lure, 0, 1), bait: whole(raw.gear.bait, 0, 99) },
      bestScore: whole(raw.bestScore, 0, 9999999), stamina: clamp(whole(raw.stamina, 10, 28) + offline, 0, 28), savedAt: now
    };
  }

  var DEBUG = { mode: 'boot', forceMode: null, forceStage: null };
  var publicState = {
    mode: 'boot', stage: 'boot', progress: { route: 0, routeLength: 0, stamina: 0, notes: 0, research: 0, habitat: 'delta' },
    score: 0, health: 100, spook: 0, odds: 0, modifiers: [], creature: null, phase: 'dawn', weather: 'clear', forceMode: null, forceStage: null
  };
  var sceneRef = null;
  var pendingMode = null;
  var pendingStage = null;
  var fsHook = {
    state: publicState,
    forceMode: function (mode) { pendingMode = mode; DEBUG.forceMode = mode; if (sceneRef) { sceneRef.forceMode(mode); sceneRef.updatePublicState(); } return publicState; },
    forceStage: function (stage) { pendingStage = stage; DEBUG.forceStage = stage; if (sceneRef) { sceneRef.forceStage(stage); sceneRef.updatePublicState(); } return publicState; }
  };
  window.__fs = fsHook;

  var kit = window.GGKit.create({
    slug: SAVE_KEY,
    orientation: 'portrait',
    validateSave: validSave,
    onPause: function () { if (sceneRef) sceneRef.setKitPaused(true); },
    onResume: function () { if (sceneRef) sceneRef.setKitPaused(false); },
    onRestart: function () { if (sceneRef) sceneRef.restartRun(); }
  });
  kit.registerPWA();
  kit.loader.show('Fieldnotes Safari');
  kit.loader.progress(0.12);
  kit.audio.register({
    'music-delta': '/play/fieldnotes-safari/assets/music-delta.mp3',
    'music-crater': '/play/fieldnotes-safari/assets/music-crater.mp3',
    step: '/play/fieldnotes-safari/assets/step.mp3', rustle: '/play/fieldnotes-safari/assets/rustle.mp3',
    approach: '/play/fieldnotes-safari/assets/approach.mp3', bait: '/play/fieldnotes-safari/assets/bait.mp3',
    lure: '/play/fieldnotes-safari/assets/lure.mp3', ring: '/play/fieldnotes-safari/assets/ring.mp3',
    throw: '/play/fieldnotes-safari/assets/throw.mp3', catch: '/play/fieldnotes-safari/assets/catch.mp3',
    miss: '/play/fieldnotes-safari/assets/miss.mp3', flee: '/play/fieldnotes-safari/assets/flee.mp3',
    photo: '/play/fieldnotes-safari/assets/photo.mp3', journal: '/play/fieldnotes-safari/assets/journal.mp3',
    unlock: '/play/fieldnotes-safari/assets/unlock.mp3', boundary: '/play/fieldnotes-safari/assets/boundary.mp3'
  });
  function sfx(name, volume) { kit.audio.sfx(name, { volume: volume == null ? 0.8 : volume }); }
  function beginMusic(habitat) { kit.audio.music(habitat && habitat.id === 'crater' ? AUDIO.musicCrater : AUDIO.musicDelta, 650); }

  function seedPointer(event) {
    var point = pointerPosition(event);
    var p = { id: event.pointerId, x: point.x, y: point.y, startX: point.x, startY: point.y, clientX: event.clientX, clientY: event.clientY, downAt: performance.now() };
    kit.input.pointers.set(event.pointerId, p);
    return p;
  }
  function pointerPosition(event) {
    var canvas = sceneRef && sceneRef.game && sceneRef.game.canvas;
    if (!canvas) return { x: 0, y: 0 };
    var rect = canvas.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) * W / Math.max(1, rect.width), 0, W), y: clamp((event.clientY - rect.top) * H / Math.max(1, rect.height), 0, H) };
  }
  var ownedPointers = new Map();
  window.addEventListener('pointerdown', function (event) {
    if (kit.paused) return;
    var p = seedPointer(event); ownedPointers.set(event.pointerId, p);
    if (sceneRef) sceneRef.pointerDown(p);
  }, { passive: false });
  window.addEventListener('pointermove', function (event) {
    var p = ownedPointers.get(event.pointerId); if (!p) return;
    var point = pointerPosition(event); p.x = point.x; p.y = point.y;
    if (sceneRef) sceneRef.pointerMove(p);
  }, { passive: false });
  window.addEventListener('pointerup', function (event) {
    var p = ownedPointers.get(event.pointerId); if (!p) return;
    var point = pointerPosition(event); p.x = point.x; p.y = point.y;
    ownedPointers.delete(event.pointerId);
    if (sceneRef) sceneRef.pointerUp(p);
    kit.input.pointers.delete(event.pointerId);
  }, { passive: false });
  window.addEventListener('pointercancel', function (event) {
    var p = ownedPointers.get(event.pointerId); if (!p) return;
    ownedPointers.delete(event.pointerId); if (sceneRef) sceneRef.pointerUp(p, true); kit.input.pointers.delete(event.pointerId);
  }, { passive: false });
  window.addEventListener('blur', function () { ownedPointers.clear(); });

  var keyEdges = [];
  window.addEventListener('keydown', function (event) {
    if (kit.paused) return;
    var code = event.code || event.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyJ', 'KeyP', 'KeyR', 'Escape'].indexOf(code) >= 0) event.preventDefault();
    if (event.repeat && code !== 'ArrowUp' && code !== 'ArrowDown' && code !== 'ArrowLeft' && code !== 'ArrowRight') return;
    keyEdges.push(code); if (keyEdges.length > 12) keyEdges.shift();
  }, { passive: false });

  function rectHit(rect, x, y) { return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h; }
  function button(x, y, w, h, label, accent) { return { x: x, y: y, w: w, h: h, label: label, accent: accent }; }
  function getWeather(scene) { var h = HABITAT_BY_ID[scene.habitatId] || HABITATS[0]; var list = h.weather; var index = Math.floor(scene.simSteps / 720) % list.length; return WEATHER_BY_ID[list[index]] || WEATHER[0]; }
  function getPhase(scene) { var slot = Math.floor((scene.simSteps % 14400) / 3600); return PHASES[slot] || PHASES[0]; }
  function isNight(scene) { return getPhase(scene).id === 'night'; }
  function journalRow(save, id) { return save.journal[id] || { seen: 0, caught: 0, photos: 0, night: 0, bestSize: 0 }; }
  function noteCount(save) { return Object.keys(save.journal).filter(function (id) { return journalRow(save, id).seen > 0; }).length; }
  function researchCount(save) { return save.research.filter(function (value, i) { return value >= RESEARCH[i].target; }).length; }

  class SafariScene extends Phaser.Scene {
    constructor() { super({ key: 'SafariScene' }); }
  }

  SafariScene.prototype.create = function () {
    sceneRef = this;
    this.save = normalizeSave(kit.save.get(defaultSave()));
    this.mode = 'menu'; this.stage = 'select'; this.habitatId = 'delta'; this.routeIndex = 0; this.route = ROUTES[0];
    this.simSteps = 0; this.accumulator = 0; this.score = 0; this.health = 100; this.stamina = this.save.stamina; this.player = { x: 195, y: 430, dir: 0, walk: 0 };
    this.currentCreature = null; this.encounterIndex = 0; this.spook = 0; this.noise = 0; this.approachDistance = 80; this.fleeWarning = 0; this.baitActive = false; this.lureActive = false; this.throws = 3; this.ringTime = 0; this.lastResult = null;
    this.photoTime = 12; this.photoQuality = 0; this.selectedTask = 0; this.selectedDex = 0; this.tutorialLife = 4; this.transient = null; this.boundary = { title: 'FIELDNOTES SAFARI', copy: 'Choose a habitat, then walk a simulated route.', life: 1.8 };
    this.motionReduced = false;
    this.world = this.add.graphics().setDepth(0); this.fx = this.add.graphics().setDepth(40); this.ui = this.add.graphics().setDepth(20);
    this.bakeTextures();
    this.images = {
      header: this.add.image(195, 48, 'fs-header').setDepth(10), bottom: this.add.image(195, 786, 'fs-bottom').setDepth(10),
      plate: this.add.image(195, 430, 'fs-plate').setDepth(10), menu: this.add.image(195, 423, 'fs-menu').setDepth(10), journal: this.add.image(195, 438, 'fs-journal').setDepth(10)
    };
    this.texts = {};
    this.makeText('title', 20, '#fff9e5', 800); this.makeText('subtitle', 14, '#b9d8c1', 600); this.makeText('hudLeft', 16, '#fff9e5', 800); this.makeText('hudRight', 14, '#b9d8c1', 800);
    this.makeText('weather', 14, '#f4c66d', 800); this.makeText('stage', 14, '#f6f0d7', 800); this.makeText('creature', 24, '#fff9e5', 900); this.makeText('creatureSub', 14, '#b9d8c1', 700);
    this.makeText('coach', 14, '#fff9e5', 700); this.makeText('transient', 14, '#142d29', 900); this.makeText('odds', 18, '#fff9e5', 900); this.makeText('mods', 14, '#b9d8c1', 700);
    this.makeText('resultTitle', 24, '#142d29', 900); this.makeText('resultCopy', 16, '#315f4f', 700); this.makeText('resultScore', 22, '#e77f67', 900); this.makeText('resultButton', 16, '#fff9e5', 900);
    this.makeText('journalTitle', 21, '#fff9e5', 900); this.makeText('journalMeta', 14, '#b9d8c1', 700); this.makeText('journalDetail', 15, '#142d29', 700);
    this.makeText('photoTitle', 20, '#fff9e5', 900); this.makeText('photoMeta', 15, '#fff9e5', 700); this.makeText('photoButton', 16, '#142d29', 900); this.makeText('photoQuality', 15, '#fff9e5', 900);
    this.makeText('catchTitle', 20, '#fff9e5', 900); this.makeText('catchMeta', 14, '#fff9e5', 700); this.makeText('catchButton', 17, '#142d29', 900); this.makeText('catchRead', 15, '#fff9e5', 800);
    this.menuHabitats = []; this.menuRoutes = []; this.taskTexts = []; this.dexTexts = [];
    for (var i = 0; i < HABITATS.length; i++) this.menuHabitats.push(this.makeText('habitat' + i, 15, '#fff9e5', 900));
    for (var r = 0; r < ROUTES.length; r++) this.menuRoutes.push(this.makeText('route' + r, 14, '#142d29', 900));
    for (var t = 0; t < RESEARCH.length; t++) this.taskTexts.push(this.makeText('task' + t, 14, '#142d29', 700));
    for (var d = 0; d < SPECIES.length; d++) this.dexTexts.push(this.makeText('dex' + d, 14, '#fff9e5', 700));
    this.particles = []; this.leafParticles = [];
    for (var p = 0; p < MAX_PARTICLES; p++) this.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, color: PAL.sun, dot: this.add.rectangle(0, 0, 5, 5, PAL.sun).setDepth(45).setVisible(false) });
    for (var lp = 0; lp < 28; lp++) this.leafParticles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 0, color: PAL.fern, dot: this.add.rectangle(0, 0, 4, 4, PAL.fern).setDepth(44).setVisible(false) });
    this.setKitPaused(false); this.updatePublicState(); kit.loader.progress(1); kit.loader.hide();
    beginMusic(HABITAT_BY_ID[this.habitatId]);
    if (pendingMode != null) this.forceMode(pendingMode); if (pendingStage != null) this.forceStage(pendingStage);
  };

  SafariScene.prototype.makeText = function (name, size, color, weight) {
    var text = this.add.text(0, 0, '', { fontFamily: 'ui-rounded, Trebuchet MS, system-ui, sans-serif', fontSize: size + 'px', color: color, fontStyle: weight >= 800 ? 'bold' : 'normal', resolution: 2 }).setDepth(30).setOrigin(0.5).setVisible(false);
    this.texts[name] = text; return text;
  };
  SafariScene.prototype.text = function (obj, value, x, y, align, size, color, visible) {
    if (!obj) return;
    if (obj.text !== String(value)) obj.setText(String(value));
    if (size != null && obj.style.fontSize !== size + 'px') obj.setFontSize(size);
    if (color && obj.style.color !== color) obj.setColor(color);
    obj.setOrigin(align === 'left' ? 0 : align === 'right' ? 1 : 0.5, 0.5); obj.setPosition(x, y); obj.setVisible(visible !== false);
  };
  SafariScene.prototype.hideAllText = function () { Object.keys(this.texts).forEach(function (key) { this.texts[key].setVisible(false); }, this); };
  SafariScene.prototype.bakeTextures = function () {
    function make(scene, key, width, height, color, stroke, radius) {
      var g = scene.make.graphics({ x: 0, y: 0, add: false }); g.fillStyle(color, 1); g.fillRoundedRect(0, 0, width, height, radius); if (stroke) { g.lineStyle(2, stroke, 0.42); g.strokeRoundedRect(1, 1, width - 2, height - 2, radius); } g.generateTexture(key, width, height); g.destroy();
    }
    make(this, 'fs-header', 378, 92, PAL.deep, PAL.mist, 18); make(this, 'fs-bottom', 378, 98, PAL.deep, PAL.mist, 20); make(this, 'fs-plate', 354, 560, PAL.charcoal, PAL.mist, 24); make(this, 'fs-menu', 370, 792, PAL.deep, PAL.sun, 28); make(this, 'fs-journal', 370, 792, PAL.paper, PAL.sun, 28);
  };

  SafariScene.prototype.setKitPaused = function (value) { this.pausedByKit = !!value; if (value) { ownedPointers.clear(); keyEdges.length = 0; } };
  SafariScene.prototype.restartRun = function () { this.mode = 'menu'; this.stage = 'select'; this.currentCreature = null; this.score = 0; this.health = 100; this.stamina = this.save.stamina; this.transient = null; this.boundary = { title: 'NEW EXPEDITION', copy: 'Your journal stays safe. Pick a route.', life: 1.6 }; };
  SafariScene.prototype.saveGame = function () { this.save.stamina = clamp(Math.floor(this.stamina), 0, 28); this.save.bestScore = Math.max(this.save.bestScore, Math.floor(this.score)); this.save.savedAt = Date.now(); kit.save.set(this.save); };

  SafariScene.prototype.forceMode = function (mode) {
    var value = String(mode == null ? '' : mode).toLowerCase();
    if (value === 'map' || value === 'walk' || value === 'expedition') { this.startExpedition(false); return; }
    if (value === 'stalk' || value === 'approach') { this.startEncounter(true); return; }
    if (value === 'catch' || value === 'ring') { if (!this.currentCreature) this.startEncounter(true); this.enterCatch(); return; }
    if (value === 'photo' || value === 'challenge') { this.startPhoto(); return; }
    if (value === 'journal' || value === 'research' || value === 'dex') { this.mode = 'journal'; this.stage = 'journal'; return; }
    if (value === 'result' || value === 'end') { this.finishRun('route', null); return; }
    this.mode = 'menu'; this.stage = 'select';
  };
  SafariScene.prototype.forceStage = function (stage) {
    var value = String(stage == null ? '' : stage).toLowerCase();
    if (value === '0' || value === 'select' || value === 'menu') { this.mode = 'menu'; this.stage = 'select'; return; }
    if (value === '1' || value === 'walk' || value === 'expedition' || value === 'map') { this.startExpedition(false); return; }
    if (value === '2' || value === 'stalk' || value === 'approach') { this.startEncounter(true); return; }
    if (value === '3' || value === 'catch' || value === 'ring') { if (!this.currentCreature) this.startEncounter(true); this.enterCatch(); return; }
    if (value === '4' || value === 'photo') { this.startPhoto(); return; }
    if (value === '5' || value === 'result') { this.finishRun('route', null); }
  };

  SafariScene.prototype.selectedHabitat = function () { return HABITAT_BY_ID[this.habitatId] || HABITATS[0]; };
  SafariScene.prototype.selectedRoute = function () { return ROUTES[this.routeIndex] || ROUTES[0]; };
  SafariScene.prototype.isUnlocked = function (species) { return species.stage === 0 || (!!RESEARCH[species.unlockTask] && this.save.research[species.unlockTask] >= RESEARCH[species.unlockTask].target); };
  SafariScene.prototype.chooseCreature = function () {
    var habitat = this.selectedHabitat(); var weather = getWeather(this); var phase = getPhase(this);
    var pool = habitat.spawnTable.filter(function (s) { return this.isUnlocked(s) && (s.weather === weather.id || (phase.id === 'night' && s.weather === 'dusk') || (phase.id !== 'night' && s.stage === 0)); }, this);
    if (!pool.length) pool = habitat.spawnTable.filter(this.isUnlocked.bind(this));
    if (!pool.length) pool = BASE_SPECIES.filter(function (s) { return s.habitat === habitat.id; });
    var species = pool[(this.encounterIndex + this.simSteps + hash(habitat.id)) % pool.length];
    this.encounterIndex += 1; return species || BASE_SPECIES[0];
  };
  SafariScene.prototype.startExpedition = function (keep) {
    if (!keep) { this.route = this.selectedRoute(); this.routeIndex = clamp(this.routeIndex, 0, ROUTES.length - 1); }
    this.mode = 'expedition'; this.stage = 'walk'; this.route = this.selectedRoute(); this.routeStep = 0; this.stamina = clamp(Math.max(this.stamina, this.route.stamina), 0, 28); this.player = { x: 195, y: 438, dir: 0, walk: 0 }; this.currentCreature = null; this.spook = 0; this.score = 0; this.boundary = null; this.tutorialLife = 4; beginMusic(this.selectedHabitat()); sfx(AUDIO.boundary, 0.35);
    this.showTransient('WALK A SIMULATED ROUTE', '#f6f0d7', 1.3);
  };
  SafariScene.prototype.travel = function (x, y) {
    if (this.mode !== 'expedition') return;
    if (this.currentCreature && dist(x, y, 300, 180) < 90) { this.startEncounter(false); return; }
    if (this.stamina <= 0) { this.finishRun('stamina', null); return; }
    var dx = x - this.player.x, dy = y - this.player.y, length = Math.hypot(dx, dy) || 1; this.player.x = clamp(this.player.x + dx / length * 44, 40, 350); this.player.y = clamp(this.player.y + dy / length * 44, FIELD_TOP + 55, FIELD_BOTTOM - 45); this.player.dir = Math.atan2(dy, dx); this.player.walk += 1; this.routeStep += 1; this.stamina = Math.max(0, this.stamina - 1); this.score += 10; sfx(AUDIO.step, 0.45); this.emitBurst(this.player.x, this.player.y + 19, this.selectedHabitat().accent, 5);
    this.emitLeaves(this.player.x, this.player.y + 17, this.selectedHabitat().accent, 4);
    if (this.routeStep >= this.route.length) { this.finishRun('route', null); return; }
    if (this.routeStep === 1 || this.routeStep % 2 === 0) { this.currentCreature = this.chooseCreature(); this.showTransient('RUSTLE NEARBY', '#f4c66d', 1.0); sfx(AUDIO.rustle, 0.5); }
  };
  SafariScene.prototype.startEncounter = function (forced) {
    if (!this.currentCreature || forced) this.currentCreature = this.chooseCreature();
    this.mode = 'stalk'; this.stage = 'approach'; this.spook = 0; this.noise = 0; this.approachDistance = 80; this.fleeWarning = 0; this.baitActive = false; this.lureActive = false;
    if (isNight(this)) { var nightRow = journalRow(this.save, this.currentCreature.id); nightRow.seen += 1; nightRow.night += 1; this.save.journal[this.currentCreature.id] = nightRow; this.updateResearch(); }
    sfx(AUDIO.rustle, 0.55); this.showTransient('SILHOUETTE ACQUIRED', '#f6f0d7', 1.0);
  };
  SafariScene.prototype.approach = function (kind) {
    if (this.mode !== 'stalk' || !this.currentCreature || this.fleeWarning > 0) return;
    var speed = kind === 'sneak' ? 4 : kind === 'walk' ? 10 : 19; var noise = kind === 'sneak' ? 1 : kind === 'walk' ? 6 : 15;
    this.approachDistance = Math.max(0, this.approachDistance - speed); this.noise = noise; this.spook = clamp(this.spook + noise * 0.7 - (kind === 'sneak' ? 2 : 0), 0, 100); sfx(AUDIO.approach, kind === 'sneak' ? 0.3 : 0.55);
    if (this.spook >= 72) { this.fleeWarning = 1.1; this.showTransient('TELEGRAPH: CREATURE WILL FLEE', '#142d29', 1.0); sfx(AUDIO.flee, 0.55); return; }
    if (this.approachDistance <= 0) this.enterCatch();
  };
  SafariScene.prototype.useBait = function () {
    if (this.mode !== 'stalk' || this.baitActive || this.save.gear.bait <= 0) { this.showTransient(this.save.gear.bait <= 0 ? 'BAIT EMPTY' : 'BAIT ALREADY FED', '#142d29', 0.9); return; }
    this.save.gear.bait -= 1; this.baitActive = true; this.spook = Math.max(0, this.spook - 12); sfx(AUDIO.bait, 0.55); this.showTransient('BAIT FED  ·  SPOOK -12', '#142d29', 1.0);
  };
  SafariScene.prototype.useLure = function () {
    if (this.mode !== 'stalk' || this.lureActive || this.save.gear.lure <= 0) return;
    this.lureActive = true; this.save.gear.lure = 0; this.spook = clamp(this.spook + 4, 0, 100); sfx(AUDIO.lure, 0.55); this.showTransient('LURE ACTIVE  ·  ODDS +8%', '#142d29', 1.0);
  };
  SafariScene.prototype.enterCatch = function () {
    if (!this.currentCreature) return;
    this.mode = 'catch'; this.stage = 'ring'; this.ringTime = 0; this.throws = 3; sfx(AUDIO.ring, 0.45); this.showTransient('THROW WHEN THE RING MEETS THE MARK', '#f6f0d7', 1.2);
  };
  SafariScene.prototype.catchOdds = function () {
    if (!this.currentCreature) return 0;
    var rarity = RARITY[this.currentCreature.rarity] || RARITY.common; var gear = 0.04 + this.save.gear.scope * 0.035; var bait = this.baitActive ? 0.12 : 0; var lure = this.lureActive ? 0.08 : 0; var calm = (100 - this.spook) * 0.0015; var ring = rarity.band * 0.52; return clamp(rarity.odds + gear + bait + lure + calm + ring, 0.08, 0.92);
  };
  SafariScene.prototype.throwRing = function () {
    if (this.mode !== 'catch' || !this.currentCreature) return;
    var rarity = RARITY[this.currentCreature.rarity] || RARITY.common; var phase = this.ringTime % 1; var radius = 18 + phase * 90; var target = 78; var tolerance = 8 + this.save.gear.scope * 4 + rarity.band * 15; var distance = Math.abs(radius - target); var quality = clamp(1 - distance / Math.max(1, tolerance * 2.5), 0, 1); var odds = this.catchOdds(); var throwScore = Math.round(quality * 100); var threshold = Math.round((1 - odds) * 100); sfx(AUDIO.throw, 0.55);
    if (throwScore >= threshold && distance <= tolerance) { this.captureSuccess(throwScore, threshold); return; }
    this.throws -= 1; this.emitBurst(248, 375, PAL.coral, 7); kit.juice.shake(3, 90); kit.juice.hitStop(45); sfx(AUDIO.miss, 0.55); this.showTransient('MISS  ·  SCORE ' + throwScore + ' / NEED ' + threshold, '#142d29', 1.0); if (this.throws <= 0) { this.mode = 'stalk'; this.stage = 'telegraph'; this.fleeWarning = 1.0; this.showTransient('TELEGRAPH: LAST THROW LOST THE TRAIL', '#142d29', 1.0); } else this.ringTime = 0;
  };
  SafariScene.prototype.captureSuccess = function (throwScore, threshold) {
    var species = this.currentCreature; var row = journalRow(this.save, species.id); var size = Math.round((12 + RARITY[species.rarity].rank * 4 + throwScore / 15) * 10) / 10; row.seen += 1; row.caught += 1; row.bestSize = Math.max(row.bestSize, size); this.save.journal[species.id] = row; this.updateResearch(); this.score += 100 + Math.round(size); this.lastResult = { kind: 'catch', species: species, size: size, throwScore: throwScore, threshold: threshold }; this.currentCreature = null; this.emitBurst(248, 375, species.color, 24); kit.juice.shake(5, 150); kit.juice.hitStop(60); sfx(AUDIO.catch, 0.75); this.finishRun('catch', this.lastResult);
  };
  SafariScene.prototype.flee = function () { var species = this.currentCreature; this.lastResult = { kind: 'flee', species: species, size: 0 }; this.currentCreature = null; this.fleeWarning = 0; sfx(AUDIO.flee, 0.65); this.finishRun('flee', this.lastResult); };
  SafariScene.prototype.finishRun = function (kind, result) { this.transient = null; this.saveGame(); this.mode = 'result'; this.stage = 'run-end'; this.lastResult = result || this.lastResult || { kind: kind, species: null }; this.boundary = { title: kind === 'catch' ? 'FIELD NOTE ADDED' : kind === 'flee' ? 'TRAIL ENDED' : 'ROUTE COMPLETE', copy: kind === 'catch' ? 'A deterministic ring score made the record.' : kind === 'flee' ? 'The flee was telegraphed before the trail went cold.' : 'The route closed without spending currency.', life: 2.2 }; sfx(AUDIO.boundary, 0.55); this.updatePublicState(); };
  SafariScene.prototype.startPhoto = function () { this.mode = 'photo'; this.stage = 'photo-challenge'; this.currentCreature = this.chooseCreature(); this.photoTime = 12; this.photoQuality = 0; this.showTransient('PHOTO CHALLENGE  ·  FRAME THE SILHOUETTE', '#f6f0d7', 1.0); };
  SafariScene.prototype.takePhoto = function () { if (this.mode !== 'photo') return; var pulse = Math.abs(Math.sin(this.simSteps / 33)); this.photoQuality = Math.round((0.58 + pulse * 0.42) * 100); var row = journalRow(this.save, this.currentCreature.id); row.seen += 1; row.photos += 1; this.save.journal[this.currentCreature.id] = row; this.updateResearch(); sfx(AUDIO.photo, 0.6); this.emitBurst(195, 385, PAL.sun, 14); this.lastResult = { kind: 'photo', species: this.currentCreature, size: 0, photoQuality: this.photoQuality }; this.finishRun('photo', this.lastResult); };
  SafariScene.prototype.updateResearch = function () {
    var changed = false; var scene = this;
    RESEARCH.forEach(function (task, i) { var row = journalRow(scene.save, task.speciesId); var value = task.kind === 'photograph' ? row.photos : task.kind === 'catch' ? row.caught : row.night; var next = Math.min(task.target, value); if (next !== scene.save.research[i]) { scene.save.research[i] = next; changed = true; } if (next >= task.target && task.habitat && scene.save.unlockedHabitats.indexOf(task.habitat) < 0) { scene.save.unlockedHabitats.push(task.habitat); changed = true; } });
    var complete = researchCount(this.save); this.save.routesUnlocked = Math.max(this.save.routesUnlocked, complete >= 8 ? 4 : complete >= 4 ? 3 : complete >= 2 ? 2 : 1); if (changed) { sfx(AUDIO.unlock, 0.45); this.showTransient('RESEARCH PROGRESS UPDATED', '#142d29', 1.0); } this.saveGame();
  };
  SafariScene.prototype.showTransient = function (text, color, life) { this.transient = { text: text, color: color || '#142d29', life: life == null ? 1 : life, max: life == null ? 1 : life }; };

  SafariScene.prototype.pointerDown = function (p) { p.downMode = this.mode; };
  SafariScene.prototype.pointerMove = function () {};
  SafariScene.prototype.pointerUp = function (p, cancelled) {
    if (cancelled || this.pausedByKit) return;
    var x = p.x, y = p.y;
    if (this.mode === 'menu') {
      if (y >= 178 && y < 400) { var col = x < 195 ? 0 : 1; var row = Math.floor((y - 178) / 72); var index = row * 2 + col; if (HABITATS[index]) { if (this.save.unlockedHabitats.indexOf(HABITATS[index].id) >= 0) { this.habitatId = HABITATS[index].id; sfx(AUDIO.journal, 0.3); } else this.showTransient('RESEARCH TO UNLOCK THIS HABITAT', '#142d29', 1.0); } }
      else if (y >= 430 && y < 610) { var route = Math.floor((y - 430) / 45); if (ROUTES[route]) { if (this.save.routesUnlocked > route) this.routeIndex = route; else this.showTransient('COMPLETE MORE RESEARCH FOR THIS ROUTE', '#142d29', 1.0); } }
      else if (rectHit(button(36, 682, 318, 66), x, y)) this.startExpedition(false);
    } else if (this.mode === 'expedition') {
      if (rectHit(button(20, 750, 170, 72), x, y)) this.travel(this.player.x + 70, this.player.y - 20);
      else if (rectHit(button(204, 750, 72, 72), x, y)) { this.mode = 'journal'; this.stage = 'journal'; sfx(AUDIO.journal, 0.4); }
      else if (rectHit(button(286, 750, 82, 72), x, y)) this.startPhoto();
      else if (y >= FIELD_TOP && y <= FIELD_BOTTOM) this.travel(x, y);
    } else if (this.mode === 'stalk') {
      if (y >= 748) { var indexStalk = Math.floor(x / 78); ['sneak', 'walk', 'sprint', 'bait', 'lure'][indexStalk] && (indexStalk === 3 ? this.useBait() : indexStalk === 4 ? this.useLure() : this.approach(['sneak', 'walk', 'sprint'][indexStalk])); }
      else if (y >= FIELD_TOP && y <= FIELD_BOTTOM && this.currentCreature && dist(x, y, 300, 190) < 92) this.enterCatch();
    } else if (this.mode === 'catch') {
      if (y >= 744) this.throwRing();
      else if (x < 78 && y < 100) { this.mode = 'stalk'; this.stage = 'approach'; }
    } else if (this.mode === 'photo') {
      if (y >= 744) this.takePhoto();
    } else if (this.mode === 'journal') {
      if (x < 78 && y < 100) { this.mode = 'expedition'; this.stage = 'walk'; }
      else if (y >= 142 && y < 650) { var taskRow = Math.floor((y - 142) / 48); var taskCol = x < 195 ? 0 : 1; var task = taskRow * 2 + taskCol; if (task >= 0 && task < RESEARCH.length) this.selectedTask = task; }
    } else if (this.mode === 'result') {
      if (y >= 680) { this.mode = 'expedition'; this.stage = 'walk'; this.boundary = null; this.currentCreature = null; this.showTransient('ROUTE READY', '#f6f0d7', 0.8); }
    }
  };

  SafariScene.prototype.processKeys = function () {
    var edge = keyEdges.shift(); if (!edge) return;
    if (edge === 'KeyR') { kit.restart(); return; }
    if (edge === 'KeyJ') { this.mode = 'journal'; this.stage = 'journal'; return; }
    if (edge === 'KeyP') { this.startPhoto(); return; }
    if (edge === 'Escape') { if (this.mode === 'catch') this.mode = 'stalk'; else if (this.mode === 'journal' || this.mode === 'photo') { this.mode = 'expedition'; this.stage = 'walk'; } return; }
    if (edge === 'Space') { if (this.mode === 'menu') this.startExpedition(false); else if (this.mode === 'stalk') this.enterCatch(); else if (this.mode === 'catch') this.throwRing(); else if (this.mode === 'photo') this.takePhoto(); else if (this.mode === 'result') { this.mode = 'expedition'; this.stage = 'walk'; this.boundary = null; } return; }
    if (this.mode === 'expedition') { if (edge === 'ArrowUp') this.travel(this.player.x, this.player.y - 80); else if (edge === 'ArrowDown') this.travel(this.player.x, this.player.y + 80); else if (edge === 'ArrowLeft') this.travel(this.player.x - 80, this.player.y); else if (edge === 'ArrowRight') this.travel(this.player.x + 80, this.player.y); }
    else if (this.mode === 'stalk') { if (edge === 'ArrowUp') this.approach('sneak'); else if (edge === 'ArrowRight') this.approach('walk'); else if (edge === 'ArrowDown') this.approach('sprint'); }
  };

  SafariScene.prototype.step = function () {
    this.simSteps += 1; this.processKeys();
    if (this.transient) { this.transient.life = Math.max(0, this.transient.life - STEP); if (this.transient.life <= 0) this.transient = null; }
    if (this.boundary) { this.boundary.life = Math.max(0, this.boundary.life - STEP); }
    if (this.tutorialLife > 0) this.tutorialLife = Math.max(0, this.tutorialLife - STEP);
    if (this.mode === 'stalk' && this.fleeWarning > 0) { this.fleeWarning = Math.max(0, this.fleeWarning - STEP); if (this.fleeWarning <= 0) this.flee(); }
    if (this.mode === 'catch') this.ringTime += STEP * 1.45;
    if (this.mode === 'photo') { this.photoTime = Math.max(0, this.photoTime - STEP); if (this.photoTime <= 0) this.finishRun('photo-time', { kind: 'photo-time', species: this.currentCreature }); }
    if (this.mode === 'expedition' && this.routeStep >= this.route.length) this.finishRun('route', null);
    this.save.savedAt = Date.now(); if (this.simSteps % 240 === 0) this.saveGame();
    this.updatePublicState();
    for (var i = this.particles.length - 1; i >= 0; i--) { var p = this.particles[i]; if (p.life <= 0) continue; p.life -= STEP; p.x += p.vx * STEP; p.y += p.vy * STEP; p.vy += 74 * STEP; if (p.life <= 0) p.dot.setVisible(false); }
    for (var li = this.leafParticles.length - 1; li >= 0; li--) { var leaf = this.leafParticles[li]; if (leaf.life <= 0) continue; leaf.life -= STEP; leaf.x += leaf.vx * STEP; leaf.y += leaf.vy * STEP; leaf.vy += 22 * STEP; if (leaf.life <= 0) leaf.dot.setVisible(false); }
  };

  SafariScene.prototype.updatePublicState = function () {
    var habitat = this.selectedHabitat(); var weather = getWeather(this); var phase = getPhase(this); var species = this.currentCreature;
    publicState.mode = this.mode; publicState.stage = this.stage; publicState.progress = { route: whole(this.routeStep, 0, 99), routeLength: this.route ? this.route.length : 0, stamina: Math.floor(this.stamina), notes: noteCount(this.save), research: researchCount(this.save), habitat: habitat.id }; publicState.score = Math.floor(this.score); publicState.health = Math.floor(this.health); publicState.spook = Math.floor(this.spook); publicState.odds = Math.round(this.catchOdds() * 100); publicState.modifiers = species ? this.modifiers() : []; publicState.creature = species ? { id: species.id, name: species.name, rarity: species.rarity } : null; publicState.phase = phase.id; publicState.weather = weather.id; publicState.forceMode = DEBUG.forceMode; publicState.forceStage = DEBUG.forceStage; fsHook.state = publicState; window.__fs.state = publicState;
    var accessible = document.getElementById('accessible-state'); if (accessible) accessible.textContent = this.mode + ' · ' + habitat.name + ' · ' + noteCount(this.save) + ' notes · ' + Math.floor(this.stamina) + ' stamina';
  };
  SafariScene.prototype.modifiers = function () { var out = ['SCOPE +' + Math.round((4 + this.save.gear.scope * 3.5)) + '%']; if (this.baitActive) out.push('BAIT +12%'); if (this.lureActive) out.push('LURE +8%'); if (this.spook > 0) out.push('SPOOK -' + Math.round(this.spook * 0.15) + '%'); return out; };

  SafariScene.prototype.emitBurst = function (x, y, color, count) { var used = 0; for (var i = 0; i < this.particles.length && used < count; i++) { var p = this.particles[i]; if (p.life > 0) continue; var angle = TAU * used / Math.max(1, count); var speed = 25 + (used % 5) * 13; p.x = x; p.y = y; p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed - 16; p.life = p.max = 0.42 + (used % 4) * 0.06; p.color = color || PAL.sun; p.dot.setFillStyle(p.color, 1).setPosition(p.x, p.y).setVisible(true); used += 1; } };
  SafariScene.prototype.emitLeaves = function (x, y, color, count) { var used = 0; for (var i = 0; i < this.leafParticles.length && used < count; i++) { var p = this.leafParticles[i]; if (p.life > 0) continue; var angle = TAU * used / Math.max(1, count) + 0.4; var speed = 14 + (used % 4) * 7; p.x = x; p.y = y; p.vx = Math.cos(angle) * speed; p.vy = Math.sin(angle) * speed - 10; p.life = p.max = 0.5 + (used % 3) * 0.08; p.color = color || PAL.fern; p.dot.setFillStyle(p.color, 0.86).setPosition(p.x, p.y).setVisible(true); used += 1; } };

  function strokeArc(g, x, y, radius, start, end, color, width) { var steps = Math.max(8, Math.ceil(Math.abs(end - start) * radius / 10)); g.lineStyle(width, color, 1); g.beginPath(); for (var i = 0; i <= steps; i++) { var t = i / steps; var a = start + (end - start) * t; var px = x + Math.cos(a) * radius; var py = y + Math.sin(a) * radius; if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); } g.strokePath(); }
  SafariScene.prototype.drawCreature = function (g, x, y, species, scale, phase, highlight) {
    if (!species) return; var s = scale || 1; var bob = Math.sin(phase * 3 + hash(species.id) % 20) * 2 * s; y += bob; var color = Phaser.Display.Color.HexStringToColor(species.color).color; var edge = highlight ? PAL.cream : PAL.shadow; g.save(); g.translateCanvas(x, y); g.scaleCanvas(s, s); g.lineStyle(highlight ? 3 : 2, edge, 1); g.fillStyle(color, 1);
    if (species.shape === 'otter' || species.shape === 'fox' || species.shape === 'dog') { g.fillEllipse(0, 5, 48, 30); g.fillCircle(-16, -12, 12); g.fillCircle(16, -12, 12); g.fillTriangle(-21, -20, -12, -33, -5, -19); g.fillTriangle(21, -20, 12, -33, 5, -19); g.fillStyle(PAL.ink, 1); g.fillCircle(-9, 3, 3); g.fillCircle(9, 3, 3); g.lineStyle(2, PAL.ink, 1); g.lineBetween(-4, 12, 4, 12); }
    else if (species.shape === 'frog') { g.fillEllipse(0, 7, 46, 31); g.fillCircle(-13, -10, 10); g.fillCircle(13, -10, 10); g.fillStyle(PAL.ink, 1); g.fillCircle(-13, -10, 3); g.fillCircle(13, -10, 3); g.lineStyle(2, PAL.ink, 1); g.arc(0, 9, 8, 0, Math.PI, false); }
    else if (species.shape === 'eel' || species.shape === 'serpent') { g.beginPath(); for (var i = -2; i <= 2; i++) { var px = i * 11; var py = Math.sin((phase + i) * 2) * 7; if (i === -2) g.moveTo(px, py); else g.lineTo(px, py); } g.lineStyle(13, color, 1); g.strokePath(); g.fillCircle(27, -1, 8); g.fillStyle(PAL.ink, 1); g.fillCircle(30, -3, 2); }
    else if (species.shape === 'manta') { g.fillTriangle(-30, 15, 0, -12, 30, 15); g.fillEllipse(0, 8, 28, 18); g.lineStyle(2, PAL.ink, 1); g.lineBetween(-20, 10, -9, 3); g.lineBetween(20, 10, 9, 3); }
    else if (species.shape === 'moth') { var wing = 1 + Math.sin(phase * 6) * 0.1; g.scaleCanvas(wing, 1); g.fillEllipse(-15, 0, 28, 38); g.fillEllipse(15, 0, 28, 38); g.fillEllipse(0, 5, 12, 28); g.fillStyle(PAL.sun, 1); g.fillCircle(-15, 0, 4); g.fillCircle(15, 0, 4); }
    else if (species.shape === 'bird') { g.fillEllipse(0, 4, 34, 26); g.fillTriangle(18, 3, 36, 7, 18, 12); g.fillTriangle(-17, 2, -34, -4, -18, 10); g.fillCircle(-8, -8, 11); g.fillStyle(PAL.ink, 1); g.fillCircle(-11, -10, 2); }
    else if (species.shape === 'beetle') { g.fillEllipse(0, 4, 34, 31); g.lineStyle(2, PAL.cream, 0.7); g.lineBetween(0, -10, 0, 18); g.fillCircle(-11, -12, 6); g.fillCircle(11, -12, 6); for (var b = -1; b <= 1; b++) { g.lineBetween(-14, b * 8 + 2, -26, b * 8 + 8); g.lineBetween(14, b * 8 + 2, 26, b * 8 + 8); } }
    else if (species.shape === 'lizard') { g.fillEllipse(0, 5, 46, 22); g.fillCircle(22, -2, 10); g.lineStyle(3, color, 1); g.lineBetween(-18, 7, -34, -8); g.lineBetween(-8, 14, -15, 26); g.lineBetween(10, 14, 16, 26); g.fillStyle(PAL.ink, 1); g.fillCircle(25, -4, 2); }
    else if (species.shape === 'squirrel') { g.fillEllipse(-2, 6, 35, 27); g.fillCircle(17, -14, 10); g.lineStyle(7, color, 1); g.strokeCircle(-20, -10, 16); g.fillStyle(PAL.ink, 1); g.fillCircle(20, -16, 2); }
    else if (species.shape === 'mole' || species.shape === 'slug') { g.fillEllipse(0, 7, 48, 24); g.fillCircle(16, -1, 9); g.lineStyle(2, PAL.cream, 0.6); g.lineBetween(-18, -4, -18, -17); g.lineBetween(-8, -3, -8, -18); g.fillStyle(PAL.ink, 1); g.fillCircle(19, -3, 2); }
    else if (species.shape === 'turtle') { g.fillEllipse(0, 4, 42, 30); g.fillCircle(23, 5, 8); g.fillCircle(-16, -7, 6); g.fillCircle(-16, 15, 6); g.fillStyle(PAL.sun, 1); g.fillCircle(0, 4, 7); }
    else if (species.shape === 'deer') { g.fillEllipse(0, 5, 38, 25); g.fillCircle(17, -13, 10); g.lineStyle(3, color, 1); g.lineBetween(13, -22, 5, -37); g.lineBetween(22, -22, 30, -37); g.lineBetween(5, -37, 0, -32); g.lineBetween(30, -37, 35, -32); }
    else { g.fillCircle(0, 3, 22); g.fillStyle(PAL.sun, 1); g.fillCircle(0, 3, 7); }
    g.restore();
  };

  SafariScene.prototype.drawWorld = function (darken) {
    var g = this.world, h = this.selectedHabitat(), phase = getPhase(this), weather = getWeather(this), ground = h.ground; g.fillStyle(h.deep, 1); g.fillRect(0, 0, W, H); g.fillStyle(ground, 1); g.fillRect(12, FIELD_TOP, W - 24, FIELD_BOTTOM - FIELD_TOP); g.lineStyle(2, h.accent, 0.35); g.strokeRoundedRect(12, FIELD_TOP, W - 24, FIELD_BOTTOM - FIELD_TOP, 22);
    var random = mulberry(hash(h.id)); for (var i = 0; i < 22; i++) { var x = 24 + random() * 342; var y = FIELD_TOP + 20 + random() * 580; var sway = Math.sin(this.simSteps / 30 + i) * 2; g.lineStyle(2, h.accent, 0.34); g.lineBetween(x, y + 10, x + sway, y - 6); g.lineBetween(x + sway, y - 4, x - 6 + sway, y - 10); g.lineBetween(x + sway, y - 4, x + 7 + sway, y - 12); }
    g.lineStyle(14, h.water, 0.38); g.beginPath(); g.moveTo(24, 520); g.lineTo(120, 480); g.lineTo(230, 525); g.lineTo(360, 470); g.strokePath(); g.lineStyle(2, h.accent, 0.46); g.beginPath(); g.moveTo(24, 520); g.lineTo(120, 480); g.lineTo(230, 525); g.lineTo(360, 470); g.strokePath();
    for (var a = 0; a < 3; a++) this.drawCreature(g, 64 + a * 135, 235 + (a % 2) * 95, BASE_SPECIES[(a + 4) % BASE_SPECIES.length], 0.34, this.simSteps / 60 + a, false);
    if (this.mode === 'expedition') { g.fillStyle(PAL.sun, 0.2); g.fillCircle(this.player.x, this.player.y, 34); this.drawPlayer(g); if (this.currentCreature) this.drawCreature(g, 300, 185, this.currentCreature, 0.72, this.simSteps / 60, false); }
    if (this.mode === 'stalk') { g.fillStyle(PAL.coral, 0.15 + this.spook * 0.002); g.fillCircle(300, 190, 48 + this.spook * 0.16); this.drawCreature(g, 300, 190, this.currentCreature, 1.15, this.simSteps / 60, this.fleeWarning <= 0); if (this.fleeWarning > 0) { g.lineStyle(4, PAL.coral, 1); g.strokeCircle(300, 190, 58); } this.drawPlayer(g); }
    if (darken) { g.fillStyle(0x071511, darken); g.fillRect(0, 0, W, H); }
    if (phase.id === 'night') { g.fillStyle(0x07152a, 0.36); g.fillRect(0, 0, W, H); } else if (phase.id === 'dusk') { g.fillStyle(0x5a3c66, 0.24); g.fillRect(0, 0, W, H); }
    if (weather.id === 'rain' || weather.id === 'storm') { g.lineStyle(1, PAL.sky, weather.id === 'storm' ? 0.55 : 0.28); for (var q = 0; q < 20; q++) { var rx = (q * 47 + this.simSteps * 2) % 390; var ry = FIELD_TOP + ((q * 71 + this.simSteps * 4) % 600); g.lineBetween(rx, ry, rx - 4, ry + 12); } }
  };
  SafariScene.prototype.drawPlayer = function (g) { var bob = Math.sin(this.simSteps / 5) * 2; g.fillStyle(PAL.cream, 1); g.fillCircle(this.player.x, this.player.y - 13 + bob, 10); g.fillStyle(PAL.coral, 1); g.fillTriangle(this.player.x - 14, this.player.y - 19 + bob, this.player.x + 14, this.player.y - 19 + bob, this.player.x, this.player.y - 32 + bob); g.fillStyle(PAL.ink, 1); g.fillRoundedRect(this.player.x - 13, this.player.y - 3 + bob, 26, 28, 7); g.fillStyle(PAL.sun, 1); g.fillRect(this.player.x - 4, this.player.y + 4 + bob, 8, 10); };

  SafariScene.prototype.drawHeader = function () {
    var g = this.ui; g.fillStyle(PAL.deep, 1); g.fillRoundedRect(6, 6, 378, 92, 18); g.lineStyle(2, this.selectedHabitat().accent, 0.5); g.strokeRoundedRect(6, 6, 378, 92, 18); var w = getWeather(this), ph = getPhase(this); this.text(this.texts.hudLeft, '✦ ' + Math.floor(this.score) + '   ▣ ' + noteCount(this.save) + '/60', 20, 25, 'left', 16, '#fff9e5'); this.text(this.texts.hudRight, '● ' + Math.floor(this.stamina), 365, 25, 'right', 16, '#b9e7af'); this.text(this.texts.weather, w.glyph + ' ' + w.label + '   ' + ph.label, 20, 58, 'left', 14, '#' + w.tint.toString(16).padStart(6, '0')); this.text(this.texts.stage, this.selectedHabitat().short + '  ·  ' + (this.route ? this.route.name : 'FIELD'), 365, 58, 'right', 14, '#b9d8c1');
    g.fillStyle(0x203c36, 1); g.fillRoundedRect(20, 77, 345, 8, 4); g.fillStyle(PAL.sun, 1); g.fillRoundedRect(20, 77, 345 * clamp(this.stamina / Math.max(1, this.route ? this.route.stamina : 10), 0, 1), 8, 4);
  };
  SafariScene.prototype.drawTransient = function () { if (!this.transient) return; var alpha = kit.juice.enabled ? clamp(this.transient.life / Math.min(0.32, this.transient.max), 0, 1) : 0.9; this.ui.fillStyle(Phaser.Display.Color.HexStringToColor(this.transient.color).color, alpha); this.ui.fillRoundedRect(18, 106, 354, 34, 10); this.text(this.texts.transient, this.transient.text, 195, 123, 'center', 14, '#142d29'); this.texts.transient.setAlpha(alpha); };
  SafariScene.prototype.drawButton = function (rect, label, accent, active) { this.ui.fillStyle(accent, active === false ? 0.28 : 1); this.ui.fillRoundedRect(rect.x, rect.y, rect.w, rect.h, 14); this.ui.lineStyle(2, PAL.cream, 0.24); this.ui.strokeRoundedRect(rect.x, rect.y, rect.w, rect.h, 14); this.text(this.texts[label.key || label], label.text || label, rect.x + rect.w / 2, rect.y + rect.h / 2, 'center', 14, accent === PAL.sun ? '#142d29' : '#fff9e5'); };

  SafariScene.prototype.renderMenu = function () {
    this.images.menu.setVisible(true); this.text(this.texts.title, 'FIELDNOTES SAFARI', 195, 46, 'center', 26, '#fff9e5'); this.text(this.texts.subtitle, 'SIMULATED EXPEDITIONS  ·  NO GPS', 195, 83, 'center', 14, '#b9d8c1');
    for (var i = 0; i < HABITATS.length; i++) { var h = HABITATS[i], x = i % 2 === 0 ? 20 : 201, y = 160 + Math.floor(i / 2) * 72, unlocked = this.save.unlockedHabitats.indexOf(h.id) >= 0; this.ui.fillStyle(unlocked ? h.ground : 0x223833, 1); this.ui.fillRoundedRect(x, y, 169, 60, 14); this.ui.lineStyle(2, unlocked ? h.accent : 0x587069, 0.7); this.ui.strokeRoundedRect(x, y, 169, 60, 14); this.text(this.menuHabitats[i], (unlocked ? '◉ ' : 'LOCKED  ') + h.name + '\n' + h.short, x + 12, y + 29, 'left', 15, unlocked ? '#fff9e5' : '#8fa79d'); }
    this.text(this.texts.stage, 'ROUTES', 25, 423, 'left', 16, '#f4c66d');
    for (var r = 0; r < ROUTES.length; r++) { var route = ROUTES[r], unlockedRoute = this.save.routesUnlocked > r, yy = 440 + r * 43; this.ui.fillStyle(unlockedRoute ? route.id === this.route.id ? PAL.sun : PAL.mist : 0x38524a, 1); this.ui.fillRoundedRect(20, yy, 350, 44, 10); this.text(this.menuRoutes[r], (unlockedRoute ? '● ' : 'LOCKED  ') + route.name + '  ' + route.length + ' steps', 34, yy + 22, 'left', 14, unlockedRoute ? '#142d29' : '#9bb4a5'); }
    this.ui.fillStyle(PAL.coral, 1); this.ui.fillRoundedRect(36, 682, 318, 66, 18); this.text(this.texts.resultButton, 'START ' + this.selectedHabitat().short + ' EXPEDITION', 195, 715, 'center', 17, '#fff9e5'); this.text(this.texts.coach, 'Tap a habitat and route. Walk by tapping the field.', 195, 774, 'center', 14, '#b9d8c1'); this.texts.coach.setAlpha(this.tutorialLife > 0 ? clamp(this.tutorialLife / 2, 0.16, 1) : 0);
    if (this.boundary) this.renderBoundary();
  };
  SafariScene.prototype.renderExpedition = function () { this.images.header.setVisible(true); this.images.bottom.setVisible(true); this.drawWorld(false); this.drawHeader(); if (this.currentCreature) { this.ui.fillStyle(PAL.paper, 1); this.ui.fillRoundedRect(242, 146, 126, 65, 14); this.text(this.texts.creature, this.currentCreature.name, 254, 165, 'left', 15, '#142d29'); this.text(this.texts.creatureSub, 'RUSTLE  ·  TAP TO STALK', 254, 190, 'left', 12, '#315f4f'); }
    this.ui.fillStyle(PAL.mint, 1); this.ui.fillRoundedRect(20, 750, 170, 72, 16); this.text(this.texts.resultButton, 'WALK', 105, 786, 'center', 17, '#142d29'); this.ui.fillStyle(PAL.sun, 1); this.ui.fillRoundedRect(204, 750, 72, 72, 16); this.text(this.texts.journalMeta, '▣', 240, 780, 'center', 20, '#142d29'); this.ui.fillStyle(PAL.lilac, 1); this.ui.fillRoundedRect(286, 750, 82, 72, 16); this.text(this.texts.photoMeta, '◉', 327, 780, 'center', 20, '#142d29'); this.drawTransient(); };
  SafariScene.prototype.renderStalk = function () { this.images.header.setVisible(true); this.images.bottom.setVisible(true); this.drawWorld(false); this.drawHeader(); this.text(this.texts.creature, this.currentCreature ? this.currentCreature.name : 'Unknown trail', 24, 150, 'left', 20, '#fff9e5'); this.text(this.texts.creatureSub, this.currentCreature ? (RARITY[this.currentCreature.rarity].label + '  ·  ' + this.approachDistance + 'm') : '', 24, 177, 'left', 14, RARITY[this.currentCreature ? this.currentCreature.rarity : 'common'].color); this.ui.fillStyle(0x203c36, 1); this.ui.fillRoundedRect(22, 200, 346, 14, 7); this.ui.fillStyle(this.spook > 65 ? PAL.coral : PAL.sun, 1); this.ui.fillRoundedRect(22, 200, 346 * this.spook / 100, 14, 7); this.text(this.texts.stage, 'SPOOK ' + Math.floor(this.spook) + '%  ·  NOISE ' + this.noise, 195, 235, 'center', 14, '#fff9e5'); this.text(this.texts.mods, (this.baitActive ? 'BAIT +12%  ·  ' : '') + (this.lureActive ? 'LURE +8%  ·  ' : '') + 'SCOPE +' + Math.round(4 + this.save.gear.scope * 3.5) + '%', 195, 274, 'center', 14, '#b9d8c1'); this.ui.fillStyle(PAL.mint, 1); this.ui.fillRoundedRect(20, 750, 69, 72, 13); this.ui.fillStyle(PAL.sky, 1); this.ui.fillRoundedRect(96, 750, 69, 72, 13); this.ui.fillStyle(PAL.coral, 1); this.ui.fillRoundedRect(172, 750, 69, 72, 13); this.ui.fillStyle(PAL.sun, 1); this.ui.fillRoundedRect(248, 750, 69, 72, 13); this.ui.fillStyle(PAL.lilac, 1); this.ui.fillRoundedRect(324, 750, 48, 72, 13); ['SNEAK', 'WALK', 'SPRINT', 'BAIT', 'LURE'].forEach(function (label, i) { this.text(this.texts.resultButton, label, [54, 130, 206, 282, 348][i], 786, 'center', 13, i === 2 ? '#fff9e5' : '#142d29'); }, this); this.drawTransient(); };
  SafariScene.prototype.renderCatch = function () { this.images.header.setVisible(true); this.images.bottom.setVisible(true); this.drawWorld(true); this.drawHeader(); var species = this.currentCreature, rarity = RARITY[species ? species.rarity : 'common'], phase = this.ringTime % 1, radius = 18 + phase * 90, odds = this.catchOdds(), target = 78, tolerance = 8 + this.save.gear.scope * 4 + rarity.band * 15; this.text(this.texts.catchTitle, 'TIMING RING', 195, 150, 'center', 20, '#fff9e5'); this.text(this.texts.catchMeta, (species ? species.name : 'Creature') + '  ·  ' + rarity.label + '  ·  ' + this.throws + ' THROWS', 195, 180, 'center', 14, '#b9d8c1'); this.drawCreature(this.world, 195, 385, species, 1.35, this.simSteps / 60, true); this.world.lineStyle(3, PAL.sun, 1); this.world.strokeCircle(195, 385, target); strokeArc(this.world, 195, 385, radius, -Math.PI / 2, Math.PI * 1.5, radius >= target - tolerance && radius <= target + tolerance ? PAL.sun : PAL.coral, radius >= target - tolerance && radius <= target + tolerance ? 6 : 3); this.text(this.texts.odds, 'ODDS  ' + Math.round(odds * 100) + '%', 195, 520, 'center', 21, '#f4c66d'); this.text(this.texts.mods, this.modifiers().join('  ·  '), 195, 550, 'center', 14, '#fff9e5'); this.text(this.texts.catchRead, 'THROW SCORE MEETS THE SURFACED THRESHOLD', 195, 588, 'center', 14, '#b9d8c1'); this.ui.fillStyle(PAL.sun, 1); this.ui.fillRoundedRect(28, 748, 334, 74, 17); this.text(this.texts.catchButton, 'THROW', 195, 785, 'center', 18, '#142d29'); this.drawTransient(); };
  SafariScene.prototype.renderPhoto = function () { this.images.header.setVisible(true); this.images.bottom.setVisible(true); this.drawWorld(true); this.drawHeader(); this.text(this.texts.photoTitle, 'PHOTO CHALLENGE', 195, 150, 'center', 21, '#fff9e5'); this.text(this.texts.photoMeta, (this.currentCreature ? this.currentCreature.name : 'Creature') + '  ·  ' + Math.ceil(this.photoTime) + 's', 195, 181, 'center', 15, '#b9d8c1'); this.drawCreature(this.world, 195 + Math.sin(this.simSteps / 25) * 72, 385, this.currentCreature, 1.3, this.simSteps / 60, true); this.ui.fillStyle(0x0b1d1a, 0.5); this.ui.fillRoundedRect(52, 280, 286, 210, 20); this.ui.lineStyle(3, PAL.sun, 0.8); this.ui.strokeRoundedRect(52, 280, 286, 210, 20); this.text(this.texts.photoQuality, 'FRAME WINDOW', 195, 520, 'center', 15, '#f4c66d'); this.ui.fillStyle(PAL.sun, 1); this.ui.fillRoundedRect(28, 748, 334, 74, 17); this.text(this.texts.photoButton, 'FRAME PHOTO', 195, 785, 'center', 17, '#142d29'); this.drawTransient(); };
  SafariScene.prototype.renderJournal = function () { this.images.journal.setVisible(true); this.text(this.texts.journalTitle, 'FIELD JOURNAL', 25, 48, 'left', 22, '#fff9e5'); this.text(this.texts.journalMeta, noteCount(this.save) + '/60 NOTES  ·  ' + researchCount(this.save) + '/20 TASKS', 365, 49, 'right', 14, '#b9d8c1'); this.text(this.texts.journalDetail, RESEARCH[this.selectedTask].copy + '  ·  ' + this.save.research[this.selectedTask] + '/' + RESEARCH[this.selectedTask].target, 195, 115, 'center', 15, '#142d29'); for (var i = 0; i < RESEARCH.length; i++) { var task = RESEARCH[i], col = i % 2, row = Math.floor(i / 2), xx = 20 + col * 178, yy = 142 + row * 48, done = this.save.research[i] >= task.target; this.ui.fillStyle(done ? PAL.moss : i === this.selectedTask ? PAL.sun : 0xc6d5c9, 1); this.ui.fillRoundedRect(xx, yy, 170, 44, 9); this.text(this.taskTexts[i], (done ? '✓ ' : '○ ') + task.title + '  ' + this.save.research[i] + '/' + task.target, xx + 10, yy + 22, 'left', 14, '#142d29'); } this.text(this.texts.coach, 'Tap a task for the full field instruction. Press J or Escape to return.', 195, 720, 'center', 14, '#b9d8c1'); };
  SafariScene.prototype.renderResult = function () { this.drawWorld(true); this.images.journal.setVisible(false); this.ui.fillStyle(PAL.paper, 1); this.ui.fillRoundedRect(28, 172, 334, 452, 28); this.ui.lineStyle(3, this.lastResult && this.lastResult.kind === 'catch' ? PAL.moss : PAL.coral, 1); this.ui.strokeRoundedRect(28, 172, 334, 452, 28); var result = this.lastResult || {}, species = result.species; this.text(this.texts.resultTitle, this.boundary ? this.boundary.title : 'ROUTE COMPLETE', 195, 222, 'center', 24, '#142d29'); if (species) this.drawCreature(this.world, 195, 325, species, 1.7, this.simSteps / 60, true); this.text(this.texts.resultCopy, species ? species.name + (result.kind === 'catch' ? ' entered the journal.' : ' slipped beyond the trail.') : 'The expedition ended cleanly.', 195, 425, 'center', 16, '#315f4f'); this.text(this.texts.resultScore, result.kind === 'catch' ? '+' + Math.floor(this.score) + ' FIELD SCORE' : result.kind === 'photo' ? 'PHOTO SAVED' : 'NO CURRENCY LOST', 195, 470, 'center', 20, '#e77f67'); this.text(this.texts.resultButton, 'CONTINUE EXPEDITION', 195, 700, 'center', 17, '#fff9e5'); this.ui.fillStyle(PAL.moss, 1); this.ui.fillRoundedRect(44, 666, 302, 68, 17); };
  SafariScene.prototype.renderBoundary = function () { if (!this.boundary) return; var alpha = kit.juice.enabled ? clamp(this.boundary.life / 0.3, 0, 1) : 1; this.ui.fillStyle(PAL.paper, alpha); this.ui.fillRoundedRect(34, 306, 322, 168, 24); this.ui.lineStyle(3, PAL.sun, alpha); this.ui.strokeRoundedRect(34, 306, 322, 168, 24); this.text(this.texts.creature, this.boundary.title, 195, 355, 'center', 22, '#142d29'); this.text(this.texts.creatureSub, this.boundary.copy, 195, 400, 'center', 14, '#315f4f'); };

  SafariScene.prototype.render = function () {
    this.world.clear(); this.ui.clear(); this.fx.clear(); this.hideAllText(); Object.keys(this.images).forEach(function (key) { this.images[key].setVisible(false); }, this);
    if (this.mode === 'menu') { this.world.fillStyle(PAL.deep, 1); this.world.fillRect(0, 0, W, H); this.renderMenu(); }
    else if (this.mode === 'expedition') this.renderExpedition();
    else if (this.mode === 'stalk') this.renderStalk();
    else if (this.mode === 'catch') this.renderCatch();
    else if (this.mode === 'photo') this.renderPhoto();
    else if (this.mode === 'journal') { this.world.fillStyle(PAL.deep, 1); this.world.fillRect(0, 0, W, H); this.renderJournal(); }
    else if (this.mode === 'result') this.renderResult();
    for (var i = 0; i < this.particles.length; i++) { var p = this.particles[i]; if (p.life > 0) p.dot.setPosition(p.x, p.y).setAlpha(kit.juice.enabled ? clamp(p.life / p.max, 0, 1) : 0.75); }
    for (var li = 0; li < this.leafParticles.length; li++) { var leaf = this.leafParticles[li]; if (leaf.life > 0) leaf.dot.setPosition(leaf.x, leaf.y).setAlpha(kit.juice.enabled ? clamp(leaf.life / leaf.max, 0, 1) : 0.72); }
    if (this.mode !== 'menu' && this.mode !== 'journal' && this.transient) this.drawTransient();
  };
  SafariScene.prototype.update = function (time, delta) {
    if (this.pausedByKit) return; var juice = kit.juice.frame(); if (juice.frozen) { this.render(); return; } this.accumulator += clamp(delta / 1000, 0, 0.1); var count = 0; while (this.accumulator >= STEP && count < MAX_STEPS) { this.accumulator -= STEP; this.step(); count += 1; } if (count >= MAX_STEPS && this.accumulator >= STEP) this.accumulator = 0; this.cameras.main.setScroll(juice.dx, juice.dy); this.render();
  };

  var config = { type: Phaser.AUTO, parent: 'game-shell', backgroundColor: '#0b1d1a', width: W, height: H, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: W, height: H }, render: { antialias: true, antialiasGL: false, powerPreference: 'high-performance', roundPixels: true, batchSize: 2048 }, fps: { target: 60, min: 30 }, scene: [SafariScene] };
  try { kit.loader.progress(0.3); new Phaser.Game(config); } catch (error) { publicState.mode = 'error'; publicState.stage = 'boot-error'; publicState.error = String(error && (error.stack || error.message) || error); window.__fs.state = publicState; var fallback = document.getElementById('boot-fallback'); if (fallback) fallback.textContent = 'Fieldnotes Safari could not start this renderer.'; }
})();
