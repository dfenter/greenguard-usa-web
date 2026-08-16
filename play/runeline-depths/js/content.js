/* Runeline Depths - content tables.
 * Orb families, depth identities, runeguards and their evolutions, enemy
 * archetypes, the 24 authored dungeons, and the daily Descent pool.
 * Pure data plus small pure lookups. No engine, no DOM, no globals beyond RD.
 */
(function (root) {
  'use strict';

  var RD = root.RD || {}; root.RD = RD;

  /* ------------------------------------------------------------- orbs */
  /* Triple coded: hue, silhouette, and centre glyph. Never hue alone. */
  RD.ORBS = [
    { id: 'ember',  label: 'Ember',  color: 0xF29A4A, deep: 0x8A4A17, glyph: 'flame',  shape: 'hex' },
    { id: 'tide',   label: 'Tide',   color: 0x38A8DE, deep: 0x14506F, glyph: 'drop',   shape: 'round' },
    { id: 'moss',   label: 'Moss',   color: 0x5BCB77, deep: 0x1F5B33, glyph: 'leaf',   shape: 'square' },
    { id: 'storm',  label: 'Storm',  color: 0x9A7CF3, deep: 0x452F7C, glyph: 'star6',  shape: 'oct' },
    { id: 'aether', label: 'Aether', color: 0xF7C948, deep: 0x7C6014, glyph: 'sun',    shape: 'diamond' },
    { id: 'heart',  label: 'Heart',  color: 0xF25C68, deep: 0x7A2129, glyph: 'heart',  shape: 'petal' }
  ];
  RD.ORB_IDS = RD.ORBS.map(function (o) { return o.id; });
  RD.ORB_BY_ID = {};
  RD.ORBS.forEach(function (o) { RD.ORB_BY_ID[o.id] = o; });
  /* Elements that can attack. Heart is support only. */
  RD.ELEMENTS = ['ember', 'tide', 'moss', 'storm', 'aether'];

  RD.orb = function (id) { return RD.ORB_BY_ID[id] || RD.ORBS[0]; };

  /* ----------------------------------------------------------- depths */
  /* Four authored depth identities: board frame material, orb skin
     variation, backdrop, ambient motif, enemy family. */
  RD.DEPTHS = [
    {
      id: 'vault', name: 'Moss Vault', short: 'Vault',
      frame: { plate: 0x2C3D57, trim: 0x6E9C74, inner: 0x1B2740, bolt: 0x9BC6A2 },
      cell: { face: 0x2C3F63, edge: 0x5D7294, void: 0x1A2440 },
      sky: [0x1B2C2A, 0x121D26, 0x0A1119],
      accent: 0x7FD9A0, mote: 0x9BE8B4, motif: 'spores',
      rim: 'stone', music: 'music_vault',
      blurb: 'Wet slate and root light. The vault still breathes.'
    },
    {
      id: 'seam', name: 'Magma Seam', short: 'Seam',
      frame: { plate: 0x3A2A2C, trim: 0xC98846, inner: 0x241A1E, bolt: 0xF0B072 },
      cell: { face: 0x36304F, edge: 0x7A6486, void: 0x201829 },
      sky: [0x2E1A1C, 0x1C1219, 0x0E0910],
      accent: 0xF2914F, mote: 0xFFC98A, motif: 'embers',
      rim: 'basalt', music: 'music_deep',
      blurb: 'Basalt ribs over a working furnace. Heat reads as light.'
    },
    {
      id: 'library', name: 'Drowned Library', short: 'Library',
      frame: { plate: 0x22394A, trim: 0x6FC4CE, inner: 0x142633, bolt: 0xAFE6EA },
      cell: { face: 0x25405F, edge: 0x5F87A6, void: 0x11202F },
      sky: [0x122B3B, 0x0D1E2C, 0x07131C],
      accent: 0x76D8E2, mote: 0xB5EEF4, motif: 'pages',
      rim: 'wetstone', music: 'music_deep',
      blurb: 'Shelves under standing water. Every page still legible.'
    },
    {
      id: 'core', name: 'The Runeline Core', short: 'Core',
      frame: { plate: 0x2A2740, trim: 0xE3D6A6, inner: 0x181632, bolt: 0xFFF2C4 },
      cell: { face: 0x2F2B54, edge: 0x7C74AE, void: 0x191636, },
      sky: [0x231E42, 0x161230, 0x0A0819],
      accent: 0xC7B0FF, mote: 0xF6ECFF, motif: 'runes',
      rim: 'obsidian', music: 'music_deep',
      blurb: 'The line itself, coiled and awake. Nothing here is stone.'
    }
  ];
  RD.DEPTH_BY_ID = {};
  RD.DEPTHS.forEach(function (d) { RD.DEPTH_BY_ID[d.id] = d; });
  RD.depth = function (id) { return RD.DEPTH_BY_ID[id] || RD.DEPTHS[0]; };

  /* ------------------------------------------------------- runeguards */
  /* Four starters (always owned) plus twelve collectables, each with an
     authored evolution. Base stats and leader skills are carried over from
     the prototype design document unchanged. */
  RD.STARTERS = [
    { id: 'trail-ember', name: 'Cinderling', el: 'ember', hp: 48, atk: 11,
      leader: 'warm-start', skill: 'Warm start: the first ember line each room hits 30 percent harder.',
      active: { id: 'spark-shift', name: 'Spark Shift', cd: 4, text: 'Turn 3 random orbs into ember.' } },
    { id: 'trail-tide', name: 'Dewdrift', el: 'tide', hp: 58, atk: 8,
      leader: 'clear-current', skill: 'Clear current: every tide line heals the party.',
      active: { id: 'dew-veil', name: 'Dew Veil', cd: 5, text: 'Heal the party for 18 percent.' } },
    { id: 'trail-moss', name: 'Mosskin', el: 'moss', hp: 68, atk: 7,
      leader: 'soft-bark', skill: 'Soft bark: the party takes 12 percent less damage.',
      active: { id: 'bark-wall', name: 'Bark Wall', cd: 6, text: 'Halve the next hit taken.' } },
    { id: 'trail-storm', name: 'Zipfin', el: 'storm', hp: 39, atk: 13,
      leader: 'quick-spark', skill: 'Quick spark: three or more colours in a line adds a combo.',
      active: { id: 'jolt', name: 'Jolt', cd: 4, text: 'Add 2 seconds to the next move timer.' } }
  ];

  RD.RUNEGUARDS = [
    { id: 'cinder-crown', name: 'Cinder Crown', el: 'ember', hp: 55, atk: 15,
      leader: 'singe-logic', skill: 'Singe logic: two or more colours doubles line damage.',
      active: { id: 'crown-burn', name: 'Crown Burn', cd: 6, text: 'Deal 4x leader attack as ember damage.' },
      evo: { name: 'Cinder Sovereign', hp: 96, atk: 27, skill: 'Singe logic II: two or more colours deals 2.3x line damage.' } },
    { id: 'brine-bloom', name: 'Brine Bloom', el: 'tide', hp: 74, atk: 10,
      leader: 'rain-ledger', skill: 'Rain ledger: tide lines heal the party for 20 percent.',
      active: { id: 'bloom-tide', name: 'Bloom Tide', cd: 5, text: 'Turn every heart orb into tide.' },
      evo: { name: 'Brine Cathedral', hp: 128, atk: 19, skill: 'Rain ledger II: tide lines heal for 28 percent.' } },
    { id: 'root-rumbler', name: 'Root Rumbler', el: 'moss', hp: 92, atk: 9,
      leader: 'deep-hold', skill: 'Deep hold: the party takes 18 percent less damage.',
      active: { id: 'deep-root', name: 'Deep Root', cd: 7, text: 'Block the next enemy turn entirely.' },
      evo: { name: 'Root Colossus', hp: 158, atk: 17, skill: 'Deep hold II: the party takes 26 percent less damage.' } },
    { id: 'thunder-mite', name: 'Thunder Mite', el: 'storm', hp: 48, atk: 18,
      leader: 'static-count', skill: 'Static count: each combo adds 12 percent damage.',
      active: { id: 'static-web', name: 'Static Web', cd: 5, text: 'Add 3 seconds to the next move timer.' },
      evo: { name: 'Thunder Marshal', hp: 88, atk: 31, skill: 'Static count II: each combo adds 17 percent damage.' } },
    { id: 'veil-vireo', name: 'Veil Vireo', el: 'aether', hp: 61, atk: 13,
      leader: 'many-sight', skill: 'Many sight: three or more colours grants one extra combo.',
      active: { id: 'veil-sight', name: 'Veil Sight', cd: 5, text: 'Reveal and clear all bound orbs.' },
      evo: { name: 'Veil Auspex', hp: 106, atk: 24, skill: 'Many sight II: three or more colours grants two extra combos.' } },
    { id: 'ash-antler', name: 'Ash Antler', el: 'ember', hp: 79, atk: 14,
      leader: 'coalheart', skill: 'Coalheart: ember lines hit 45 percent harder.',
      active: { id: 'coal-surge', name: 'Coal Surge', cd: 6, text: 'Turn 5 random orbs into ember.' },
      evo: { name: 'Ashwake Stag', hp: 134, atk: 25, skill: 'Coalheart II: ember lines hit 62 percent harder.' } },
    { id: 'rill-raven', name: 'Rill Raven', el: 'tide', hp: 63, atk: 16,
      leader: 'low-tide-cut', skill: 'Low tide cut: tide lines hit 55 percent harder.',
      active: { id: 'undertow', name: 'Undertow', cd: 6, text: 'Turn 5 random orbs into tide.' },
      evo: { name: 'Rill Corvid', hp: 108, atk: 28, skill: 'Low tide cut II: tide lines hit 74 percent harder.' } },
    { id: 'fern-fang', name: 'Fern Fang', el: 'moss', hp: 81, atk: 15,
      leader: 'green-echo', skill: 'Green echo: three or more colours restores 8 percent health.',
      active: { id: 'green-echo-a', name: 'Green Echo', cd: 5, text: 'Heal the party for 24 percent.' },
      evo: { name: 'Fern Warden', hp: 139, atk: 26, skill: 'Green echo II: three or more colours restores 13 percent health.' } },
    { id: 'gale-gourmand', name: 'Gale Gourmand', el: 'storm', hp: 67, atk: 17,
      leader: 'pressure-feast', skill: 'Pressure feast: a combo of four or more adds 35 percent damage.',
      active: { id: 'pressure-cut', name: 'Pressure Cut', cd: 6, text: 'Strip the enemy shield and armour for 2 turns.' },
      evo: { name: 'Gale Epicure', hp: 115, atk: 30, skill: 'Pressure feast II: a combo of four or more adds 50 percent damage.' } },
    { id: 'opal-owl', name: 'Opal Owl', el: 'aether', hp: 73, atk: 12,
      leader: 'prism-rule', skill: 'Prism rule: unmatched colours still deal 40 percent damage.',
      active: { id: 'prism-call', name: 'Prism Call', cd: 5, text: 'Turn 4 random orbs into aether.' },
      evo: { name: 'Opal Auger', hp: 126, atk: 22, skill: 'Prism rule II: unmatched colours still deal 58 percent damage.' } },
    { id: 'flare-fawn', name: 'Flare Fawn', el: 'ember', hp: 70, atk: 19,
      leader: 'bright-rake', skill: 'Bright rake: the first hit in each room deals 50 percent more.',
      active: { id: 'bright-rake-a', name: 'Bright Rake', cd: 7, text: 'Deal 6x leader attack, ignoring armour.' },
      evo: { name: 'Flare Hart', hp: 120, atk: 33, skill: 'Bright rake II: the first hit in each room deals 80 percent more.' } },
    { id: 'moon-marrow', name: 'Moon Marrow', el: 'aether', hp: 86, atk: 16,
      leader: 'quiet-math', skill: 'Quiet math: two or more colours grants a damage shield.',
      active: { id: 'quiet-ward', name: 'Quiet Ward', cd: 6, text: 'Grant a shield worth 40 percent of party health.' },
      evo: { name: 'Moon Marrowbone', hp: 148, atk: 28, skill: 'Quiet math II: two or more colours grants a larger shield.' } }
  ];

  RD.ALL_GUARDS = RD.STARTERS.concat(RD.RUNEGUARDS);
  RD.GUARD_BY_ID = {};
  RD.ALL_GUARDS.forEach(function (c) { RD.GUARD_BY_ID[c.id] = c; });
  RD.knownGuard = function (id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(RD.GUARD_BY_ID, id);
  };
  RD.guard = function (id) { return RD.GUARD_BY_ID[id] || RD.STARTERS[0]; };
  /* Guarded lookup for any variant/dynamic content key. */
  RD.canEvolve = function (id) { return !!(RD.GUARD_BY_ID[id] && RD.GUARD_BY_ID[id].evo); };

  /* Evolution costs by the tier the runeguard is found in. */
  RD.EVO_COST = [140, 240, 360, 500];

  /* Stat view for a runeguard at an evolution level (0 base, 1 evolved). */
  RD.guardStats = function (id, evoLevel) {
    var g = RD.guard(id);
    if (evoLevel >= 1 && g.evo) {
      return { id: g.id, name: g.evo.name, el: g.el, hp: g.evo.hp, atk: g.evo.atk,
        leader: g.leader, skill: g.evo.skill, active: g.active, evolved: true };
    }
    return { id: g.id, name: g.name, el: g.el, hp: g.hp, atk: g.atk,
      leader: g.leader, skill: g.skill, active: g.active, evolved: false };
  };

  /* ------------------------------------------------- enemy archetypes */
  /* skills: preempt, bind, shield, armour, mend, enrage, timelock, swap.
     hpMul / atkMul scale the shared curve; chargeMax is turns between
     attacks. shape/tone drive the procedural portrait in art.js. */
  function E(id, name, family, el, hpMul, atkMul, charge, shape, skills) {
    return { id: id, name: name, family: family, el: el, hpMul: hpMul,
      atkMul: atkMul, charge: charge, shape: shape, skills: skills || [] };
  }

  RD.ENEMIES = [
    /* --- Moss Vault ------------------------------------------------- */
    E('pebble-chorister', 'Pebble Chorister', 'vault', 'moss', 0.72, 0.80, 3, 'cluster', []),
    E('spore-lantern', 'Spore Lantern', 'vault', 'moss', 0.80, 0.72, 2, 'lantern', []),
    E('mudback-toad', 'Mudback Toad', 'vault', 'tide', 1.05, 0.86, 3, 'squat', [{ k: 'armour', v: 0.14 }]),
    E('vault-sentry', 'Vault Sentry', 'vault', 'storm', 0.96, 0.95, 3, 'tower', [{ k: 'shield', v: 3, hp: 0.30 }]),
    E('creeping-sill', 'Creeping Sill', 'vault', 'moss', 1.20, 0.78, 4, 'wall', [{ k: 'armour', v: 0.22 }]),
    E('moss-wolf', 'Moss Wolf', 'vault', 'moss', 0.84, 1.18, 2, 'beast', [{ k: 'enrage', v: 1.55, at: 0.30 }]),
    E('silt-weaver', 'Silt Weaver', 'vault', 'tide', 0.90, 0.88, 3, 'spider', [{ k: 'bind', v: 2, every: 3 }]),
    E('lantern-vein', 'Lantern Vein', 'vault', 'aether', 1.00, 0.90, 3, 'vine', [{ k: 'mend', v: 0.08, at: 0.45 }]),
    /* --- Magma Seam --------------------------------------------------- */
    E('cinder-hound', 'Cinder Hound', 'seam', 'ember', 0.86, 1.22, 2, 'beast', []),
    E('slag-wisp', 'Slag Wisp', 'seam', 'ember', 0.70, 1.05, 2, 'wisp', [{ k: 'preempt', v: 0.55 }]),
    E('forge-cricket', 'Forge Cricket', 'seam', 'storm', 0.78, 1.10, 1, 'insect', []),
    E('basalt-warden', 'Basalt Warden', 'seam', 'moss', 1.35, 0.92, 4, 'tower', [{ k: 'armour', v: 0.28 }]),
    E('emberfly-swarm', 'Emberfly Swarm', 'seam', 'ember', 0.92, 0.86, 1, 'swarm', [{ k: 'bind', v: 2, every: 4 }]),
    E('kiln-golem', 'Kiln Golem', 'seam', 'ember', 1.45, 1.05, 4, 'golem', [{ k: 'shield', v: 4, hp: 0.35 }]),
    E('ash-coyote', 'Ash Coyote', 'seam', 'ember', 0.88, 1.30, 2, 'beast', [{ k: 'enrage', v: 1.7, at: 0.28 }]),
    E('vent-serpent', 'Vent Serpent', 'seam', 'storm', 1.10, 1.12, 3, 'serpent', [{ k: 'timelock', v: 1.5, every: 3 }]),
    /* --- Drowned Library ---------------------------------------------- */
    E('ink-eel', 'Ink Eel', 'library', 'tide', 0.92, 1.14, 2, 'serpent', [{ k: 'bind', v: 3, every: 3 }]),
    E('page-wraith', 'Page Wraith', 'library', 'aether', 0.86, 1.20, 2, 'wraith', [{ k: 'preempt', v: 0.7 }]),
    E('drowned-scribe', 'Drowned Scribe', 'library', 'tide', 1.12, 1.00, 3, 'robed', [{ k: 'mend', v: 0.10, at: 0.50 }]),
    E('tide-lamp', 'Tide Lamp', 'library', 'aether', 1.00, 0.94, 3, 'lantern', [{ k: 'shield', v: 5, hp: 0.32 }]),
    E('glass-carp', 'Glass Carp', 'library', 'tide', 0.95, 1.08, 2, 'fish', []),
    E('margin-hound', 'Margin Hound', 'library', 'storm', 1.05, 1.25, 2, 'beast', [{ k: 'enrage', v: 1.6, at: 0.32 }]),
    E('silent-reader', 'Silent Reader', 'library', 'storm', 1.18, 1.05, 3, 'robed', [{ k: 'timelock', v: 2.0, every: 3 }]),
    E('salt-codex', 'Salt Codex', 'library', 'aether', 1.40, 0.98, 4, 'book', [{ k: 'armour', v: 0.30 }, { k: 'bind', v: 2, every: 4 }]),
    /* --- Runeline Core ------------------------------------------------ */
    E('rune-mote', 'Rune Mote', 'core', 'aether', 0.82, 1.30, 1, 'wisp', []),
    E('line-warden', 'Line Warden', 'core', 'storm', 1.30, 1.12, 3, 'tower', [{ k: 'shield', v: 6, hp: 0.34 }]),
    E('null-bloom', 'Null Bloom', 'core', 'moss', 1.15, 1.08, 3, 'bloom', [{ k: 'bind', v: 3, every: 2 }]),
    E('prism-hound', 'Prism Hound', 'core', 'aether', 1.00, 1.42, 2, 'beast', [{ k: 'preempt', v: 0.8 }]),
    E('seam-anchor', 'Seam Anchor', 'core', 'ember', 1.55, 1.00, 4, 'golem', [{ k: 'armour', v: 0.34 }]),
    E('cipher-wheel', 'Cipher Wheel', 'core', 'storm', 1.22, 1.18, 3, 'wheel', [{ k: 'timelock', v: 2.0, every: 2 }]),
    E('core-shepherd', 'Core Shepherd', 'core', 'moss', 1.35, 1.15, 3, 'robed', [{ k: 'mend', v: 0.12, at: 0.55 }]),
    E('zero-glyph', 'Zero Glyph', 'core', 'aether', 1.28, 1.35, 2, 'glyph', [{ k: 'enrage', v: 1.8, at: 0.30 }])
  ];

  /* --- bosses ------------------------------------------------------- */
  function B(id, name, family, el, hpMul, atkMul, charge, shape, skills) {
    var e = E(id, name, family, el, hpMul, atkMul, charge, shape, skills);
    e.boss = true; return e;
  }
  RD.BOSSES = [
    /* Moss Vault */
    B('pebble-choir', 'The Pebble Choir', 'vault', 'moss', 2.10, 1.05, 3, 'choir',
      [{ k: 'shield', v: 3, hp: 0.55 }, { k: 'armour', v: 0.12 }]),
    B('mire-needle', 'Mire-Needle', 'vault', 'tide', 2.05, 1.20, 2, 'spider',
      [{ k: 'bind', v: 2, every: 3 }, { k: 'preempt', v: 0.6 }]),
    B('gallowvine', 'Gallowvine', 'vault', 'moss', 2.35, 1.10, 3, 'vine',
      [{ k: 'mend', v: 0.09, at: 0.5 }, { k: 'armour', v: 0.18 }]),
    B('old-sparkjaw', 'Old Sparkjaw', 'vault', 'storm', 2.20, 1.32, 2, 'beast',
      [{ k: 'enrage', v: 1.7, at: 0.32 }, { k: 'timelock', v: 1.5, every: 4 }]),
    B('cask-of-vines', 'Cask of Vines', 'vault', 'moss', 2.55, 1.08, 4, 'golem',
      [{ k: 'armour', v: 0.26 }, { k: 'shield', v: 4, hp: 0.45 }]),
    B('cradleback', 'Cradleback', 'vault', 'tide', 2.45, 1.25, 3, 'squat',
      [{ k: 'bind', v: 3, every: 3 }, { k: 'mend', v: 0.08, at: 0.45 }]),
    /* Magma Seam */
    B('quiet-kiln', 'The Quiet Kiln', 'seam', 'ember', 2.40, 1.22, 3, 'golem',
      [{ k: 'shield', v: 5, hp: 0.50 }, { k: 'preempt', v: 0.8 }]),
    B('emberlash', 'Emberlash', 'seam', 'ember', 2.30, 1.45, 2, 'serpent',
      [{ k: 'enrage', v: 1.75, at: 0.30 }, { k: 'timelock', v: 2.0, every: 3 }]),
    B('soot-regent', 'Soot Regent', 'seam', 'ember', 2.60, 1.28, 3, 'robed',
      [{ k: 'bind', v: 3, every: 2 }, { k: 'armour', v: 0.22 }]),
    B('cloud-eater', 'Cloud-Eater', 'seam', 'storm', 2.70, 1.30, 3, 'wraith',
      [{ k: 'mend', v: 0.11, at: 0.55 }, { k: 'shield', v: 5, hp: 0.40 }]),
    B('copper-hush', 'The Copper Hush', 'seam', 'aether', 2.85, 1.22, 4, 'wheel',
      [{ k: 'armour', v: 0.32 }, { k: 'timelock', v: 2.0, every: 2 }]),
    B('aster-moth', 'Aster Moth', 'seam', 'aether', 2.75, 1.42, 2, 'moth',
      [{ k: 'preempt', v: 0.9 }, { k: 'bind', v: 3, every: 3 }, { k: 'enrage', v: 1.5, at: 0.25 }]),
    /* Drowned Library */
    B('drowned-bell', 'The Drowned Bell', 'library', 'tide', 2.90, 1.28, 3, 'bell',
      [{ k: 'shield', v: 6, hp: 0.50 }, { k: 'mend', v: 0.10, at: 0.5 }]),
    B('marrowtide', 'Marrowtide', 'library', 'tide', 2.85, 1.48, 2, 'serpent',
      [{ k: 'bind', v: 3, every: 2 }, { k: 'enrage', v: 1.6, at: 0.3 }]),
    B('index-keeper', 'The Index Keeper', 'library', 'aether', 3.05, 1.32, 3, 'book',
      [{ k: 'armour', v: 0.34 }, { k: 'timelock', v: 2.0, every: 3 }]),
    B('fathom-choir', 'Fathom Choir', 'library', 'storm', 3.00, 1.38, 3, 'choir',
      [{ k: 'preempt', v: 1.0 }, { k: 'shield', v: 6, hp: 0.45 }]),
    B('nine-knot', 'Nine-Knot', 'library', 'storm', 3.15, 1.42, 2, 'spider',
      [{ k: 'bind', v: 4, every: 2 }, { k: 'armour', v: 0.24 }]),
    B('vesper-maw', 'Vesper Maw', 'library', 'ember', 3.25, 1.55, 2, 'maw',
      [{ k: 'enrage', v: 1.8, at: 0.28 }, { k: 'mend', v: 0.12, at: 0.5 }, { k: 'preempt', v: 1.0 }]),
    /* Runeline Core */
    B('root-of-noon', 'Root of Noon', 'core', 'moss', 3.30, 1.40, 3, 'bloom',
      [{ k: 'armour', v: 0.30 }, { k: 'mend', v: 0.12, at: 0.55 }]),
    B('meridian-null', 'Null Meridian', 'core', 'storm', 3.35, 1.50, 2, 'glyph',
      [{ k: 'bind', v: 4, every: 2 }, { k: 'timelock', v: 2.5, every: 3 }]),
    B('long-glint', 'The Long Glint', 'core', 'aether', 3.45, 1.48, 3, 'wheel',
      [{ k: 'shield', v: 7, hp: 0.50 }, { k: 'armour', v: 0.28 }]),
    B('sundered-line', 'The Sundered Line', 'core', 'ember', 3.55, 1.62, 2, 'maw',
      [{ k: 'preempt', v: 1.1 }, { k: 'enrage', v: 1.7, at: 0.3 }]),
    B('first-rune', 'First Rune', 'core', 'aether', 3.70, 1.55, 3, 'glyph',
      [{ k: 'shield', v: 7, hp: 0.45 }, { k: 'bind', v: 4, every: 3 }, { k: 'mend', v: 0.10, at: 0.5 }]),
    B('depth-that-listens', 'The Depth That Listens', 'core', 'storm', 4.10, 1.70, 2, 'choir',
      [{ k: 'preempt', v: 1.2 }, { k: 'shield', v: 8, hp: 0.55 }, { k: 'bind', v: 4, every: 2 },
       { k: 'enrage', v: 1.6, at: 0.25 }, { k: 'armour', v: 0.20 }])
  ];

  RD.ENEMY_BY_ID = {};
  RD.ENEMIES.concat(RD.BOSSES).forEach(function (e) { RD.ENEMY_BY_ID[e.id] = e; });
  RD.enemy = function (id) { return RD.ENEMY_BY_ID[id] || RD.ENEMIES[0]; };

  /* --------------------------------------------------------- dungeons */
  /* 24 authored dungeons, 6 per depth, each 5 or 6 rooms ending in a boss.
     `drop` names the runeguard recruited on a first clear. */
  function D(id, depth, name, base, rooms, boss, drop) {
    return { id: id, depth: depth, name: name, base: base, rooms: rooms, boss: boss, drop: drop || null };
  }

  RD.DUNGEONS = [
    D(1, 'vault', 'Silt Door', 1,
      ['pebble-chorister', 'spore-lantern', 'pebble-chorister', 'mudback-toad'], 'pebble-choir', null),
    D(2, 'vault', 'Lantern Vein', 3,
      ['spore-lantern', 'silt-weaver', 'mudback-toad', 'lantern-vein', 'moss-wolf'], 'mire-needle', 'cinder-crown'),
    D(3, 'vault', 'Fernlock Gate', 4,
      ['moss-wolf', 'creeping-sill', 'silt-weaver', 'vault-sentry', 'lantern-vein'], 'gallowvine', null),
    D(4, 'vault', 'Murmur Shelf', 6,
      ['vault-sentry', 'moss-wolf', 'silt-weaver', 'creeping-sill', 'mudback-toad'], 'old-sparkjaw', 'brine-bloom'),
    D(5, 'vault', 'Hollow Orchard', 7,
      ['creeping-sill', 'lantern-vein', 'vault-sentry', 'moss-wolf', 'silt-weaver'], 'cask-of-vines', null),
    D(6, 'vault', 'Glassroot', 9,
      ['silt-weaver', 'creeping-sill', 'vault-sentry', 'lantern-vein', 'moss-wolf'], 'cradleback', 'root-rumbler'),

    D(7, 'seam', 'Copper Wound', 9,
      ['cinder-hound', 'slag-wisp', 'forge-cricket', 'cinder-hound'], 'quiet-kiln', null),
    D(8, 'seam', 'Cinder Stair', 11,
      ['slag-wisp', 'ash-coyote', 'emberfly-swarm', 'forge-cricket', 'cinder-hound'], 'emberlash', 'thunder-mite'),
    D(9, 'seam', 'Blue Ember', 12,
      ['basalt-warden', 'emberfly-swarm', 'vent-serpent', 'ash-coyote', 'slag-wisp'], 'soot-regent', null),
    D(10, 'seam', 'Bellows Hollow', 14,
      ['kiln-golem', 'vent-serpent', 'ash-coyote', 'basalt-warden', 'emberfly-swarm'], 'cloud-eater', 'veil-vireo'),
    D(11, 'seam', 'Ash Archive', 15,
      ['vent-serpent', 'kiln-golem', 'basalt-warden', 'ash-coyote', 'slag-wisp', 'emberfly-swarm'], 'copper-hush', null),
    D(12, 'seam', 'Cloud Scar', 17,
      ['ash-coyote', 'vent-serpent', 'kiln-golem', 'forge-cricket', 'basalt-warden'], 'aster-moth', 'ash-antler'),

    D(13, 'library', 'Wickwater', 17,
      ['glass-carp', 'ink-eel', 'page-wraith', 'tide-lamp', 'glass-carp'], 'drowned-bell', null),
    D(14, 'library', 'Tidewell', 19,
      ['ink-eel', 'drowned-scribe', 'margin-hound', 'glass-carp', 'page-wraith'], 'marrowtide', 'rill-raven'),
    D(15, 'library', 'The Slow Stair', 20,
      ['silent-reader', 'salt-codex', 'ink-eel', 'tide-lamp', 'margin-hound'], 'index-keeper', null),
    D(16, 'library', 'Quiet Index', 22,
      ['salt-codex', 'silent-reader', 'drowned-scribe', 'page-wraith', 'margin-hound', 'ink-eel'], 'fathom-choir', 'fern-fang'),
    D(17, 'library', 'Night Reservoir', 23,
      ['margin-hound', 'tide-lamp', 'silent-reader', 'salt-codex', 'drowned-scribe'], 'nine-knot', null),
    D(18, 'library', 'Saltglass Hall', 25,
      ['salt-codex', 'margin-hound', 'silent-reader', 'ink-eel', 'tide-lamp', 'page-wraith'], 'vesper-maw', 'gale-gourmand'),

    D(19, 'core', 'The Underbough', 25,
      ['rune-mote', 'null-bloom', 'prism-hound', 'line-warden', 'rune-mote'], 'root-of-noon', null),
    D(20, 'core', 'Meridian Shelf', 27,
      ['prism-hound', 'cipher-wheel', 'seam-anchor', 'null-bloom', 'rune-mote'], 'meridian-null', 'opal-owl'),
    D(21, 'core', 'Last Switchback', 28,
      ['line-warden', 'zero-glyph', 'core-shepherd', 'cipher-wheel', 'prism-hound'], 'long-glint', null),
    D(22, 'core', 'The Thin Seam', 30,
      ['seam-anchor', 'zero-glyph', 'cipher-wheel', 'core-shepherd', 'line-warden', 'null-bloom'], 'sundered-line', 'flare-fawn'),
    D(23, 'core', 'First Line', 31,
      ['zero-glyph', 'core-shepherd', 'seam-anchor', 'prism-hound', 'cipher-wheel'], 'first-rune', null),
    D(24, 'core', 'Runeline Heart', 33,
      ['core-shepherd', 'zero-glyph', 'line-warden', 'seam-anchor', 'cipher-wheel', 'null-bloom'], 'depth-that-listens', 'moon-marrow')
  ];

  RD.DUNGEON_BY_ID = {};
  RD.DUNGEONS.forEach(function (d) { RD.DUNGEON_BY_ID[d.id] = d; });
  RD.dungeon = function (id) { return RD.DUNGEON_BY_ID[id] || RD.DUNGEONS[0]; };
  RD.dungeonTier = function (d) {
    var i = RD.DEPTHS.map(function (x) { return x.id; }).indexOf(d.depth);
    return i < 0 ? 0 : i;
  };
  RD.roomCount = function (d) { return d.rooms.length + 1; };

  /* Rune payout. */
  RD.RUNES_PER_ROOM = 6;
  RD.dungeonReward = function (d, first) {
    var t = RD.dungeonTier(d);
    return (first ? 40 : 14) + t * (first ? 25 : 8);
  };

  /* --------------------------------------------------- daily Descent */
  /* Six rooms drawn from a date-seeded pool with one authored modifier.
     No drops, no evolution; a pure score run that resets each day. */
  RD.DESCENT_MODS = [
    { id: 'short-line', name: 'Short line', text: 'Move timer is 4.5 seconds.', timer: 4.5 },
    { id: 'thin-air', name: 'Thin air', text: 'Party health is halved.', hp: 0.5 },
    { id: 'stone-skin', name: 'Stone skin', text: 'Every enemy carries 20 percent armour.', armour: 0.2 },
    { id: 'quickening', name: 'Quickening', text: 'Enemies act one turn sooner.', charge: -1 },
    { id: 'heart-drought', name: 'Heart drought', text: 'Heart orbs are rare.', heartWeight: 0.35 },
    { id: 'long-line', name: 'Long line', text: 'Move timer is 8 seconds, enemies hit 25 percent harder.', timer: 8, atk: 1.25 },
    { id: 'bound-depth', name: 'Bound depth', text: 'One colour is bound at the start of every room.', openBind: true }
  ];
  RD.DESCENT_POOL = [
    'moss-wolf', 'silt-weaver', 'vault-sentry', 'creeping-sill', 'lantern-vein',
    'ash-coyote', 'vent-serpent', 'kiln-golem', 'basalt-warden', 'emberfly-swarm',
    'ink-eel', 'margin-hound', 'silent-reader', 'salt-codex', 'tide-lamp',
    'prism-hound', 'cipher-wheel', 'seam-anchor', 'zero-glyph', 'null-bloom'
  ];
  RD.DESCENT_BOSSES = ['cradleback', 'aster-moth', 'nine-knot', 'long-glint', 'vesper-maw', 'copper-hush'];

  /* ------------------------------------------------------- tuning ---- */
  RD.TUNE = {
    W: 6, H: 5,
    moveTime: 6.0,          /* prototype tuned constant */
    maxPath: 30,            /* prototype tuned constant */
    maxCascade: 5,          /* prototype tuned constant */
    onEl: 1.22,             /* prototype tuned constant */
    offEl: 0.58,            /* prototype tuned constant */
    comboStep: 0.16,        /* prototype tuned constant */
    lengthStep: 0.15,
    heartHeal: 0.035,
    enemyFloorScale: 0.035, /* prototype tuned constant */
    hpBase: 92, hpStep: 31, /* prototype tuned constants */
    atkBase: 10, atkStep: 2,/* prototype tuned constants */
    party: 5
  };

  /* Tutorial beats, one thin strip line each, shown on the first run only. */
  RD.TUTORIAL = [
    { id: 'pick', text: 'Hold an orb and drag it. Orbs you pass swap places.' },
    { id: 'timer', text: 'The ring is your move time. Let go before it empties.' },
    { id: 'match', text: 'Three in a row clears. Every clear is one combo.' },
    { id: 'heart', text: 'Rose heart orbs heal the party instead of attacking.' },
    { id: 'turn', text: 'The enemy acts when its charge ring fills.' },
    { id: 'skill', text: 'Tap a runeguard portrait to spend a ready skill.' }
  ];

  RD.SAVE_VERSION = 3;
})(typeof window !== 'undefined' ? window : globalThis);
