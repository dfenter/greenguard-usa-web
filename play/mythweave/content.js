/* Mythweave - content registry. Original IP: every name, kit, foe, realm
 * and chapter below is written for this title. The tuned combat constants
 * (card values, foe hit points, move cycles, chapter one battles) carry over
 * from the Mythweave prototype and must not drift.
 */
window.MWDATA = (function () {
  'use strict';

  /* ------------------------------------------------------------ elements
   * A six element ring. Each element overcomes exactly one other, so the
   * matchup is always readable from one arrow: ember > ash > tide > ember,
   * glass > bone > loom > glass.
   */
  var ELEMENTS = {
    ember: { name: 'Ember', mark: 'E', col: '#ff9a45', beats: 'ash' },
    tide: { name: 'Tide', mark: 'T', col: '#3fd8c8', beats: 'ember' },
    ash: { name: 'Ash', mark: 'A', col: '#b6a2d8', beats: 'tide' },
    glass: { name: 'Glass', mark: 'G', col: '#8fd8ff', beats: 'bone' },
    bone: { name: 'Bone', mark: 'B', col: '#e8e0cc', beats: 'loom' },
    loom: { name: 'Loom', mark: 'L', col: '#c9a9ff', beats: 'glass' }
  };

  /* class triangle: blade cuts ward, ward smothers rite, rite unmakes blade */
  var CLASSES = {
    blade: { name: 'Blade', mark: '/', beats: 'ward' },
    ward: { name: 'Ward', mark: '#', beats: 'rite' },
    rite: { name: 'Rite', mark: 'o', beats: 'blade' }
  };

  /* ------------------------------------------------------------- spirits
   * card fields: n name, k kind (strike|guard|arcana), d damage, hits,
   * ad damage to all, b block, h heal, w weaken turns, wa weaken all,
   * bu burn, p power, dr drain, sd self damage, ig ignores block,
   * chain bonus per prior card in the chain, tag player facing text.
   */
  var SPIRITS = {
    weaver: {
      name: 'The Weaver', short: 'WVR', col: '#c9a9ff', dark: '#3a2456', g: 0,
      elem: 'loom', cls: 'rite', role: 'Loom-walker',
      lore: 'You. A loom-walker who binds myth to thread and carries the empty spool.',
      cards: [
        { n: 'Weft Strike', k: 'strike', d: 6, tag: 'Deal 6' },
        { n: 'Warp Guard', k: 'guard', b: 7, tag: 'Gain 7 block' },
        { n: 'Taut Thread', k: 'arcana', d: 4, p: 2, tag: 'Deal 4, plus 2 power' }
      ],
      ult: { n: 'Loomburst', d: 15, b: 9, tag: 'Deal 15, gain 9 block' }
    },
    vulmar: {
      name: 'Vulmar, Forge Titan', short: 'VUL', col: '#ff9a45', dark: '#5c2a10', g: 1,
      elem: 'ember', cls: 'blade', role: 'Forge titan',
      lore: 'A slag-shouldered giant who sleeps under cold anvils and wakes for good work.',
      cards: [
        { n: 'Anvil Strike', k: 'strike', d: 9, tag: 'Deal 9' },
        { n: 'Cinder Guard', k: 'guard', b: 9, tag: 'Gain 9 block' },
        { n: 'Molten Vow', k: 'arcana', p: 4, b: 3, tag: 'Plus 4 power, 3 block' }
      ],
      ult: { n: 'Starforge Hammer', d: 24, ad: 7, tag: 'Deal 24, plus 7 to all' }
    },
    sethrin: {
      name: 'Sethrin, River Serpent', short: 'SET', col: '#3fd8c8', dark: '#0d4a48', g: 2,
      elem: 'tide', cls: 'ward', role: 'River serpent',
      lore: 'The long green current that remembers every drowned name.',
      cards: [
        { n: 'Undertow', k: 'strike', d: 6, w: 1, tag: 'Deal 6, weaken 1' },
        { n: 'Mendwater', k: 'guard', h: 9, tag: 'Heal 9' },
        { n: 'Tide Coil', k: 'arcana', b: 6, h: 4, tag: '6 block, heal 4' }
      ],
      ult: { n: 'Drown The Ruin', ad: 13, h: 16, tag: '13 to all, heal 16' }
    },
    kaark: {
      name: 'Kaark, Ash Raven', short: 'KRK', col: '#b6a2d8', dark: '#372c4a', g: 3,
      elem: 'ash', cls: 'blade', role: 'Ash raven',
      lore: 'It eats the last warm ember of anything that dies, and it is never full.',
      cards: [
        { n: 'Cinder Peck', k: 'strike', d: 4, hits: 2, tag: 'Deal 4 twice' },
        { n: 'Soot Veil', k: 'guard', w: 2, b: 4, tag: 'Weaken 2, 4 block' },
        { n: 'Ash Feather', k: 'arcana', d: 4, bu: 4, tag: 'Deal 4, burn 4' }
      ],
      ult: { n: 'Pyre Migration', ad: 9, bu: 7, tag: '9 to all, burn 7 all' }
    },
    grendok: {
      name: 'Grendok, Stone Hound', short: 'GRN', col: '#8fb96a', dark: '#2c3d1c', g: 4,
      elem: 'ash', cls: 'ward', role: 'Stone hound',
      lore: 'Loyal boulder-beast. It has guarded one empty gate for centuries.',
      cards: [
        { n: 'Boulder Bite', k: 'strike', d: 8, tag: 'Deal 8' },
        { n: 'Kennel Wall', k: 'guard', b: 13, tag: 'Gain 13 block' },
        { n: 'Hollow Howl', k: 'arcana', w: 2, d: 3, tag: 'Deal 3, weaken 2' }
      ],
      ult: { n: 'Mountain Bulwark', b: 26, d: 13, tag: '26 block, deal 13' }
    },
    lumeth: {
      name: 'Lumeth, Glass Stag', short: 'LUM', col: '#8fd8ff', dark: '#1a3a52', g: 5,
      elem: 'glass', cls: 'rite', role: 'Glass stag',
      lore: 'Antlers of cooled lightning. It steps only on ground that tells the truth.',
      cards: [
        { n: 'Prism Antler', k: 'strike', d: 7, ig: 1, tag: 'Deal 7, ignores block' },
        { n: 'Refract', k: 'guard', b: 8, p: 2, tag: '8 block, plus 2 power' },
        { n: 'Clarity', k: 'arcana', h: 6, p: 3, tag: 'Heal 6, plus 3 power' }
      ],
      ult: { n: 'Shatterlight', d: 20, ig: 1, b: 12, tag: '20 piercing, 12 block' }
    },
    thraxa: {
      name: 'Thraxa, Dune Wyrm', short: 'THX', col: '#e0c268', dark: '#4d3d12', g: 6,
      elem: 'ash', cls: 'rite', role: 'Dune wyrm',
      lore: 'A hunger shaped like a mile of moving sand.',
      cards: [
        { n: 'Sand Lash', k: 'strike', ad: 6, tag: 'Deal 6 to all' },
        { n: 'Burrow', k: 'guard', b: 10, tag: 'Gain 10 block' },
        { n: 'Grit Storm', k: 'arcana', wa: 1, ad: 3, tag: '3 to all, weaken all' }
      ],
      ult: { n: 'Dune Devourer', ad: 18, h: 8, tag: '18 to all, heal 8' }
    },
    ninveil: {
      name: 'Ninveil, Moth Oracle', short: 'NIN', col: '#e59ce0', dark: '#4a2148', g: 7,
      elem: 'loom', cls: 'rite', role: 'Moth oracle',
      lore: 'It reads the future in the dust of its own wings and rarely likes what it finds.',
      cards: [
        { n: 'Omen Flurry', k: 'strike', d: 5, chain: 5, tag: 'Deal 5, plus 5 per prior card' },
        { n: 'Lantern Wing', k: 'guard', h: 7, b: 5, tag: 'Heal 7, 5 block' },
        { n: 'Dust Sight', k: 'arcana', p: 6, tag: 'Plus 6 power' }
      ],
      ult: { n: 'Eclipse Chorus', d: 16, p: 8, h: 6, tag: 'Deal 16, plus 8 power, heal 6' }
    },
    ossivane: {
      name: 'Ossivane, Bone Choir', short: 'OSS', col: '#e8e0cc', dark: '#4a4436', g: 8,
      elem: 'bone', cls: 'ward', role: 'Bone choir',
      lore: 'A hundred singing ribs stacked into one grim and courteous shape.',
      cards: [
        { n: 'Rib Chime', k: 'strike', d: 12, sd: 3, tag: 'Deal 12, lose 3 HP' },
        { n: 'Marrow Draw', k: 'guard', dr: 7, tag: 'Deal 7, heal for it' },
        { n: 'Dirge', k: 'arcana', bu: 5, w: 1, tag: 'Burn 5, weaken 1' }
      ],
      ult: { n: 'Choir Of Nine', ad: 14, h: 12, tag: '14 to all, heal 12' }
    },
    sableen: {
      name: 'Sableen, Lantern Koi', short: 'SBL', col: '#5fb8ff', dark: '#123a5c', g: 9,
      elem: 'tide', cls: 'blade', role: 'Lantern koi',
      lore: 'She swims the flooded lanes with a paper lamp balanced on her back.',
      cards: [
        { n: 'Lantern Cut', k: 'strike', d: 8, tag: 'Deal 8' },
        { n: 'Koi Screen', k: 'guard', b: 8, h: 3, tag: '8 block, heal 3' },
        { n: 'Paper Current', k: 'arcana', ad: 5, w: 1, tag: '5 to all, weaken 1' }
      ],
      ult: { n: 'Riverlight Procession', ad: 15, b: 10, tag: '15 to all, gain 10 block' }
    },
    orroven: {
      name: 'Orroven, Bell Warden', short: 'ORV', col: '#ffb066', dark: '#4d3116', g: 10,
      elem: 'bone', cls: 'ward', role: 'Bell warden',
      lore: 'A rung bronze warden. It counts your enemies out loud, then stops counting.',
      cards: [
        { n: 'Toll Strike', k: 'strike', d: 10, tag: 'Deal 10' },
        { n: 'Bellguard', k: 'guard', b: 12, p: 1, tag: '12 block, plus 1 power' },
        { n: 'Resonate', k: 'arcana', p: 3, bu: 4, tag: 'Plus 3 power, burn 4' }
      ],
      ult: { n: 'Ninefold Toll', d: 18, ad: 8, b: 10, tag: 'Deal 18, 8 to all, 10 block' }
    }
  };

  /* display order for the roster grid; the weaver is always present */
  var ORDER = ['vulmar', 'sableen', 'kaark', 'sethrin', 'grendok', 'ossivane',
    'thraxa', 'orroven', 'lumeth', 'ninveil'];

  /* --------------------------------------------------------------- foes */
  function E(id, name, hp, fam, col, elem, cls, moves) {
    return { id: id, name: name, hp: hp, fam: fam, col: col, elem: elem, cls: cls, moves: moves };
  }
  var FOES = {
    husk: E('husk', 'Rustmoth Husk', 38, 'moth', '#9a8f7a', 'ash', 'blade',
      [{ t: 'atk', v: 7 }, { t: 'atk', v: 10 }, { t: 'grd', v: 8 }]),
    thorn: E('thorn', 'Thorn Effigy', 32, 'effigy', '#a07f5a', 'ash', 'ward',
      [{ t: 'atk', v: 8 }, { t: 'atk', v: 9 }]),
    lampling: E('lampling', 'Lamplight Stray', 34, 'lamp', '#ffcf7a', 'ember', 'rite',
      [{ t: 'atk', v: 6 }, { t: 'buf', v: 3 }, { t: 'atk', v: 9 }]),
    wretch: E('wretch', 'Bramble Wretch', 50, 'effigy', '#7fa05a', 'ash', 'ward',
      [{ t: 'atk', v: 10 }, { t: 'atk2', v: 6 }, { t: 'hex', v: 2 }]),
    wickmother: E('wickmother', 'The Wickmother', 120, 'lamp', '#ff9a45', 'ember', 'rite',
      [{ t: 'atk', v: 12 }, { t: 'grd', v: 12 }, { t: 'atk2', v: 8 }, { t: 'hex', v: 2 }]),
    drift: E('drift', 'Drift Chorister', 48, 'choir', '#8fb6d8', 'tide', 'rite',
      [{ t: 'atk', v: 9 }, { t: 'hex', v: 2 }, { t: 'atk2', v: 6 }]),
    bellkeep: E('bellkeep', 'Bell Keeper', 58, 'bell', '#a8c8d8', 'tide', 'ward',
      [{ t: 'grd', v: 10 }, { t: 'atk', v: 12 }, { t: 'atk2', v: 7 }]),
    salt: E('salt', 'Salt Revenant', 74, 'revenant', '#a8c8d8', 'bone', 'blade',
      [{ t: 'atk', v: 13 }, { t: 'grd', v: 14 }, { t: 'atk', v: 17 }]),
    tidebound: E('tidebound', 'Tidebound Abbess', 150, 'bell', '#3fd8c8', 'tide', 'rite',
      [{ t: 'atk', v: 14 }, { t: 'atk2', v: 9 }, { t: 'grd', v: 18 }, { t: 'hex', v: 3 }]),
    kin: E('kin', 'Cinder Kin', 46, 'kin', '#ff8a5a', 'ember', 'blade',
      [{ t: 'atk2', v: 7 }, { t: 'buf', v: 3 }, { t: 'atk', v: 13 }]),
    emberjack: E('emberjack', 'Emberjack', 44, 'kin', '#ffb066', 'ember', 'blade',
      [{ t: 'atk', v: 10 }, { t: 'atk2', v: 6 }]),
    marshal: E('marshal', 'Dune Marshal', 70, 'marshal', '#e0c268', 'ash', 'ward',
      [{ t: 'hex', v: 2 }, { t: 'atk', v: 15 }, { t: 'atk2', v: 10 }]),
    cindercrown: E('cindercrown', 'Cindercrown', 168, 'crown', '#ff6b4a', 'ember', 'blade',
      [{ t: 'atk', v: 16 }, { t: 'atk2', v: 11 }, { t: 'buf', v: 4 }, { t: 'atk', v: 22 }]),
    shardling: E('shardling', 'Shardling', 40, 'shard', '#8fd8ff', 'glass', 'blade',
      [{ t: 'atk', v: 9 }, { t: 'atk', v: 11 }]),
    spine: E('spine', 'Spine Herald', 64, 'spine', '#d8b0a0', 'bone', 'rite',
      [{ t: 'atk', v: 13 }, { t: 'buf', v: 3 }, { t: 'atk', v: 16 }]),
    warden: E('warden', 'Glass Warden', 108, 'warden', '#8fd8ff', 'glass', 'ward',
      [{ t: 'grd', v: 16 }, { t: 'atk', v: 21 }, { t: 'atk2', v: 12 }, { t: 'buf', v: 5 }]),
    mote: E('mote', 'Loom Mote', 26, 'mote', '#c9a9ff', 'loom', 'rite',
      [{ t: 'atk', v: 7 }, { t: 'grd', v: 6 }]),
    severance: E('severance', 'Severance Hand', 80, 'hand', '#ff8fd0', 'loom', 'blade',
      [{ t: 'atk', v: 15 }, { t: 'atk2', v: 10 }, { t: 'hex', v: 2 }]),
    choir: E('choir', 'Hollow Choirmaster', 136, 'choir', '#e8e0cc', 'bone', 'rite',
      [{ t: 'atk2', v: 12 }, { t: 'grd', v: 20 }, { t: 'atk', v: 24 }, { t: 'hex', v: 3 }]),
    unwoven: E('unwoven', 'The Unwoven', 210, 'rift', '#ff6b9d', 'loom', 'blade',
      [{ t: 'atk', v: 18 }, { t: 'atk2', v: 13 }, { t: 'grd', v: 22 }, { t: 'atk', v: 28 }, { t: 'hex', v: 3 }])
  };

  /* -------------------------------------------------------------- realms */
  var REALMS = {
    lantern: {
      id: 'lantern', name: 'The Lantern Quarter', short: 'LANTERN CITY',
      accent: '#ffb066', deep: '#2a1526', sky: '#160b18', glow: '#ff8a3c',
      music: 'lantern', motif: 'lanterns',
      myth: 'Paper lanterns are hung for names nobody remembers.',
      encounters: ['husk', 'thorn', 'lampling', 'wretch']
    },
    shrine: {
      id: 'shrine', name: 'The Drowned Shrine', short: 'DROWNED SHRINE',
      accent: '#3fd8c8', deep: '#0b2430', sky: '#061620', glow: '#2fb8d8',
      music: 'shrine', motif: 'bells',
      myth: 'Bells ring underwater on the hour they were drowned.',
      encounters: ['drift', 'bellkeep', 'salt', 'mote']
    },
    steppe: {
      id: 'steppe', name: 'The Ash Steppe', short: 'ASH STEPPE',
      accent: '#d8a06a', deep: '#241a1c', sky: '#180f12', glow: '#ff7a45',
      music: 'steppe', motif: 'stones',
      myth: 'Standing stones lean toward whatever is walking.',
      encounters: ['kin', 'emberjack', 'marshal', 'thorn']
    },
    glass: {
      id: 'glass', name: 'The Glass March', short: 'GLASS MARCH',
      accent: '#8fd8ff', deep: '#141a30', sky: '#0a0e1e', glow: '#7fb8ff',
      music: 'shrine', motif: 'shards',
      myth: 'Your reflection walks a half step behind and does not always match.',
      encounters: ['shardling', 'spine', 'mote', 'salt']
    },
    loom: {
      id: 'loom', name: 'The Loom', short: 'THE LOOM',
      accent: '#ff6b9d', deep: '#1a0c22', sky: '#0a0510', glow: '#c060ff',
      music: 'loom', motif: 'warp',
      myth: 'The cut still hangs here, patient, waiting to be finished.',
      encounters: ['mote', 'severance', 'spine', 'shardling']
    }
  };

  /* ------------------------------------------------------------ chapters
   * five chapters, twenty four battles, one rising boss per chapter.
   * b.kind: story | bond | boss. b.reward binds a spirit on first clear.
   */
  var CHAPTERS = [
    {
      name: 'I. THE LANTERN QUARTER', realm: 'lantern',
      story: 'The loom-halls burned a hundred years back. You walk their ash with an empty spool and a titan asleep in your shadow.',
      battles: [
        { n: 'Ash Road', kind: 'story', foes: ['husk', 'husk'], story: 'Rustmoth husks crawl the ash road, chewing what is left of the old thread.' },
        { n: 'Bond: Vulmar', kind: 'bond', bond: 'vulmar', foes: ['thorn', 'thorn'], story: 'Vulmar wants his old forge cleared. Effigies squat in it. Optional, and it deepens his bond.' },
        { n: 'Paper Lane', kind: 'story', foes: ['lampling', 'husk'], story: 'A lane of paper lanterns, each one lit for a name nobody kept.', reward: 'sableen', rstory: 'A koi with a lantern on her back surfaces in the flooded gutter. SABLEEN joins the weave.' },
        { n: 'Char Grove', kind: 'story', foes: ['wretch', 'husk', 'lampling'], story: 'The grove still smoulders. A wretch of burnt brambles blocks the path.', reward: 'kaark', rstory: 'A bird made of settled ash lands on your spool. KAARK joins the weave.' },
        { n: 'The Wickmother', kind: 'boss', foes: ['wickmother'], story: 'She keeps every wick in the quarter lit, and she is finished sharing the fire.', reward: 'sethrin', rstory: 'The quarter drains into a black river. Something long and green offers you its name: SETHRIN.' }
      ]
    },
    {
      name: 'II. THE DROWNED SHRINE', realm: 'shrine',
      story: 'The river carries you down into a shrine that kept ringing after the water took it.',
      battles: [
        { n: 'Sunken Stair', kind: 'story', foes: ['drift', 'drift'], story: 'Choristers drift up the stair, still holding the note they died on.' },
        { n: 'Bond: Sethrin', kind: 'bond', bond: 'sethrin', foes: ['mote', 'mote', 'mote'], story: 'Sethrin needs the loom motes drained before she can remember her deeper current.' },
        { n: 'Bell Court', kind: 'story', foes: ['bellkeep', 'drift'], story: 'A keeper rings the hour the shrine went under, over and over.', reward: 'grendok', rstory: 'A boulder-beast has guarded the shrine gate alone for centuries. GRENDOK follows you now.' },
        { n: 'Salt Vigil', kind: 'story', foes: ['salt', 'mote'], story: 'A revenant of dried salt keeps a vigil for water that is already here.' },
        { n: 'Tidebound Abbess', kind: 'boss', foes: ['tidebound', 'drift'], story: 'The abbess never surfaced. She simply learned to breathe the flood.', reward: 'ossivane', rstory: 'From the shrine ossuary a hundred singing ribs stack into one grim shape. OSSIVANE sings for the weave.' }
      ]
    },
    {
      name: 'III. THE ASH STEPPE', realm: 'steppe',
      story: 'Above the shrine the land opens into grey steppe, and the stones on it lean toward whatever is walking.',
      battles: [
        { n: 'Cinder Flats', kind: 'story', foes: ['kin', 'kin'], story: 'Cinder kin skitter across the flats, shrieking at their own heat.' },
        { n: 'Bond: Free Choice', kind: 'bond', bond: 'any', foes: ['mote', 'thorn', 'mote'], story: 'The loose thread here will sharpen whoever you bring. Optional, and it deepens every bond in your party.' },
        { n: 'Emberjack Run', kind: 'story', foes: ['emberjack', 'kin', 'emberjack'], story: 'Emberjacks run the ridgeline in a line of small hot deaths.', reward: 'thraxa', rstory: 'The dune opens one enormous eye. THRAXA has decided you are interesting.' },
        { n: 'Sandsong', kind: 'story', foes: ['marshal', 'kin'], story: 'A marshal of the dunes calls the steppe back into moving sand.' },
        { n: 'Cindercrown', kind: 'boss', foes: ['cindercrown'], story: 'A crown of standing fire walks the ridge and the stones bow to it.', reward: 'orroven', rstory: 'Under the crown a bronze warden stops counting the dead and starts counting for you. ORROVEN joins.' }
      ]
    },
    {
      name: 'IV. THE GLASS MARCH', realm: 'glass',
      story: 'Beyond the steppe the ground turns to fused glass. Your reflection walks a half step behind you and does not always match.',
      battles: [
        { n: 'Fused Flats', kind: 'story', foes: ['shardling', 'shardling'], story: 'Shardlings pick themselves out of the mirror-ground and follow.', reward: 'lumeth', rstory: 'A stag of cooled lightning steps out of the glass. LUMETH walks with you.' },
        { n: 'Bond: Lumeth', kind: 'bond', bond: 'lumeth', foes: ['mote', 'shardling'], story: 'Lumeth will only step on ground that tells the truth. Clear the liars.' },
        { n: 'Mirror Road', kind: 'story', foes: ['spine', 'shardling'], story: 'Heralds of bone walk the mirror road counting your party twice.' },
        { n: 'Rib Vault', kind: 'story', foes: ['spine', 'spine'], story: 'A vault of ribs, and a chant that keeps correcting itself.', reward: 'ninveil', rstory: 'From the shards a pale moth lifts, reading a future only it can see. NINVEIL joins.' },
        { n: 'The Glass Warden', kind: 'boss', foes: ['warden'], story: 'The Warden is every mirror you have passed, stacked into one shape.' }
      ]
    },
    {
      name: 'V. THE LOOM', realm: 'loom',
      story: 'The last hall has no floor, only loose thread. Whatever cut the world still hangs here, patient, waiting to be finished.',
      battles: [
        { n: 'Loose Thread', kind: 'story', foes: ['mote', 'mote', 'mote'], story: 'Motes of raw loom drift where the floor should be.' },
        { n: 'Severance', kind: 'story', foes: ['severance', 'mote'], story: 'A hand of pure severance reaches for the nearest bound name.' },
        { n: 'Hollow Choir', kind: 'story', foes: ['choir'], story: 'The Choirmaster conducts the unmaking. Silence him.' },
        { n: 'THE UNWOVEN', kind: 'boss', finale: 1, foes: ['unwoven', 'mote'], story: 'It is the cut itself. End it and the loom-halls hold. Fail and there is nothing left to fail in.' }
      ]
    }
  ];

  /* -------------------------------------------------------------- trials
   * Trials of the Weave. Fixed seed, fixed waves, one standing rule each,
   * so a run is repeatable and comparable. First clear grants an ascension
   * token. Unlocked by clearing the matching chapter.
   */
  var TRIALS = [
    {
      id: 't1', name: 'Trial of Threads', realm: 'lantern', seed: 1071, chapter: 0,
      rule: 'hand4', ruleText: 'You draw four cards instead of five.',
      waves: [['husk', 'husk'], ['thorn', 'lampling'], ['wretch', 'husk']]
    },
    {
      id: 't2', name: 'Trial of Tides', realm: 'shrine', seed: 2298, chapter: 1,
      rule: 'noheal', ruleText: 'Healing is halved for the whole trial.',
      waves: [['drift', 'drift'], ['bellkeep', 'mote'], ['salt']]
    },
    {
      id: 't3', name: 'Trial of Cinders', realm: 'steppe', seed: 3355, chapter: 2,
      rule: 'rage', ruleText: 'Every foe gains 1 attack at the end of each round.',
      waves: [['kin', 'emberjack'], ['marshal'], ['kin', 'kin', 'emberjack']]
    },
    {
      id: 't4', name: 'Trial of Mirrors', realm: 'glass', seed: 4412, chapter: 3,
      rule: 'noblock', ruleText: 'Block you gain is halved.',
      waves: [['shardling', 'shardling'], ['spine', 'shardling'], ['warden']]
    },
    {
      id: 't5', name: 'Trial of Bones', realm: 'loom', seed: 5529, chapter: 4,
      rule: 'gaugehalf', ruleText: 'Weave gauges fill at half rate.',
      waves: [['spine', 'spine'], ['severance'], ['choir']]
    },
    {
      id: 't6', name: 'Trial of the Cut', realm: 'loom', seed: 6606, chapter: 4,
      rule: 'rage', ruleText: 'Every foe gains 1 attack at the end of each round.',
      waves: [['mote', 'mote', 'mote'], ['severance', 'spine'], ['unwoven']]
    }
  ];

  /* chapter difficulty ramp applied to foe hit points and move values.
   * Chapter one is 1.0 so the tuned prototype battles are untouched. */
  var CH_SCALE = [1, 1.15, 1.35, 1.6, 1.75];
  /* ascension multiplier on card values (prototype tiers plus one) */
  var ASC_MUL = [1, 1.3, 1.65, 2.0];
  var ASC_NAME = ['Bound', 'Deepened', 'Woven', 'Ascendant'];
  var MAX_LEVEL = 20;

  return {
    ELEMENTS: ELEMENTS, CLASSES: CLASSES, SPIRITS: SPIRITS, ORDER: ORDER,
    FOES: FOES, REALMS: REALMS, CHAPTERS: CHAPTERS, TRIALS: TRIALS,
    CH_SCALE: CH_SCALE, ASC_MUL: ASC_MUL, ASC_NAME: ASC_NAME, MAX_LEVEL: MAX_LEVEL
  };
})();
