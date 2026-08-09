/* Mythweave - data: spirits, cards, chapters. All names original. */
(function () {
  /* card fields: n name, d dmg, hits, ad all-enemy dmg, b block, h heal,
     w weaken turns, bu burn, p power, dr drain, sd self-damage, tag desc */
  M.SPIRITS = {
    weaver: {
      name: 'The Weaver', short: 'WVR', col: '#c9a9ff', dark: '#3a2456', g: 0,
      lore: 'You. A loom-walker who binds myth to thread.',
      cards: [
        { n: 'Weft Strike', d: 6, tag: 'Deal 6' },
        { n: 'Warp Guard', b: 7, tag: 'Gain 7 block' },
        { n: 'Taut Thread', d: 4, p: 2, tag: 'Deal 4, +2 power' }
      ],
      ult: { n: 'Loomburst', d: 15, b: 9, tag: 'Deal 15, gain 9 block' }
    },
    vulmar: {
      name: 'Vulmar, Forge Titan', short: 'VUL', col: '#ff9a45', dark: '#5c2a10', g: 1,
      lore: 'A slag-shouldered giant who sleeps under cold anvils.',
      cards: [
        { n: 'Anvil Strike', d: 9, tag: 'Deal 9' },
        { n: 'Cinder Guard', b: 9, tag: 'Gain 9 block' },
        { n: 'Molten Vow', p: 4, b: 3, tag: '+4 power, 3 block' }
      ],
      ult: { n: 'Starforge Hammer', d: 24, ad: 7, tag: 'Deal 24, +7 to all' }
    },
    sethrin: {
      name: 'Sethrin, River Serpent', short: 'SET', col: '#3fd8c8', dark: '#0d4a48', g: 2,
      lore: 'The long green current that remembers every drowned name.',
      cards: [
        { n: 'Undertow', d: 6, w: 1, tag: 'Deal 6, weaken 1' },
        { n: 'Mendwater', h: 9, tag: 'Heal 9' },
        { n: 'Tide Coil', b: 6, h: 4, tag: '6 block, heal 4' }
      ],
      ult: { n: 'Drown The Ruin', ad: 13, h: 16, tag: '13 to all, heal 16' }
    },
    kaark: {
      name: 'Kaark, Ash Raven', short: 'KRK', col: '#b6a2d8', dark: '#372c4a', g: 3,
      lore: 'It eats the last warm ember of anything that dies.',
      cards: [
        { n: 'Cinder Peck', d: 4, hits: 2, tag: 'Deal 4 twice' },
        { n: 'Soot Veil', w: 2, b: 4, tag: 'Weaken 2, 4 block' },
        { n: 'Ash Feather', d: 4, bu: 4, tag: 'Deal 4, burn 4' }
      ],
      ult: { n: 'Pyre Migration', ad: 9, bu: 7, tag: '9 to all, burn 7 all' }
    },
    grendok: {
      name: 'Grendok, Stone Hound', short: 'GRN', col: '#8fb96a', dark: '#2c3d1c', g: 4,
      lore: 'Loyal boulder-beast. It has guarded one empty gate for centuries.',
      cards: [
        { n: 'Boulder Bite', d: 8, tag: 'Deal 8' },
        { n: 'Kennel Wall', b: 13, tag: 'Gain 13 block' },
        { n: 'Hollow Howl', w: 2, d: 3, tag: 'Deal 3, weaken 2' }
      ],
      ult: { n: 'Mountain Bulwark', b: 26, d: 13, tag: '26 block, deal 13' }
    },
    lumeth: {
      name: 'Lumeth, Glass Stag', short: 'LUM', col: '#8fd8ff', dark: '#1a3a52', g: 5,
      lore: 'Antlers of cooled lightning. Steps only on true ground.',
      cards: [
        { n: 'Prism Antler', d: 7, ig: 1, tag: 'Deal 7, ignores armor' },
        { n: 'Refract', b: 8, p: 2, tag: '8 block, +2 power' },
        { n: 'Clarity', h: 6, p: 3, tag: 'Heal 6, +3 power' }
      ],
      ult: { n: 'Shatterlight', d: 20, ig: 1, b: 12, tag: '20 piercing, 12 block' }
    },
    thraxa: {
      name: 'Thraxa, Dune Wyrm', short: 'THX', col: '#e0c268', dark: '#4d3d12', g: 6,
      lore: 'A hunger shaped like a mile of moving sand.',
      cards: [
        { n: 'Sand Lash', ad: 6, tag: 'Deal 6 to all' },
        { n: 'Burrow', b: 10, tag: 'Gain 10 block' },
        { n: 'Grit Storm', wa: 1, ad: 3, tag: '3 to all, weaken all' }
      ],
      ult: { n: 'Dune Devourer', ad: 18, h: 8, tag: '18 to all, heal 8' }
    },
    ninveil: {
      name: 'Ninveil, Moth Oracle', short: 'NIN', col: '#e59ce0', dark: '#4a2148', g: 7,
      lore: 'Reads the future in the dust of its own wings.',
      cards: [
        { n: 'Dust Sight', p: 6, tag: '+6 power' },
        { n: 'Lantern Wing', h: 7, b: 5, tag: 'Heal 7, 5 block' },
        { n: 'Omen Flurry', d: 5, chain: 5, tag: 'Deal 5, +5 per prior card' }
      ],
      ult: { n: 'Eclipse Chorus', d: 16, p: 8, h: 6, tag: 'Deal 16, +8 power, heal 6' }
    },
    ossivane: {
      name: 'Ossivane, Bone Choir', short: 'OSS', col: '#e8e0cc', dark: '#4a4436', g: 8,
      lore: 'A hundred singing ribs stacked into one grim shape.',
      cards: [
        { n: 'Rib Chime', d: 12, sd: 3, tag: 'Deal 12, lose 3 HP' },
        { n: 'Marrow Draw', dr: 7, tag: 'Deal 7, heal for it' },
        { n: 'Dirge', bu: 5, w: 1, tag: 'Burn 5, weaken 1' }
      ],
      ult: { n: 'Choir Of Nine', ad: 14, h: 12, tag: '14 to all, heal 12' }
    }
  };
  M.ORDER = ['vulmar', 'sethrin', 'kaark', 'grendok', 'lumeth', 'thraxa', 'ninveil', 'ossivane'];

  /* enemy archetypes. moves cycle each round.
     move: {t:'atk',v}|{t:'atk2',v}|{t:'grd',v}|{t:'buf',v}|{t:'hex',v} */
  function E(id, name, hp, g, col, moves) { return { id: id, name: name, hp: hp, g: g, col: col, moves: moves }; }
  M.FOES = {
    husk: E('husk', 'Rustmoth Husk', 38, 0, '#9a8f7a', [{ t: 'atk', v: 7 }, { t: 'atk', v: 10 }, { t: 'grd', v: 8 }]),
    wretch: E('wretch', 'Bramble Wretch', 50, 1, '#7fa05a', [{ t: 'atk', v: 10 }, { t: 'atk2', v: 6 }, { t: 'hex', v: 2 }]),
    kin: E('kin', 'Cinder Kin', 46, 2, '#ff8a5a', [{ t: 'atk2', v: 7 }, { t: 'buf', v: 3 }, { t: 'atk', v: 13 }]),
    salt: E('salt', 'Salt Revenant', 74, 3, '#a8c8d8', [{ t: 'atk', v: 13 }, { t: 'grd', v: 14 }, { t: 'atk', v: 17 }]),
    warden: E('warden', 'Glass Warden', 108, 4, '#8fd8ff', [{ t: 'grd', v: 16 }, { t: 'atk', v: 21 }, { t: 'atk2', v: 12 }, { t: 'buf', v: 5 }]),
    marshal: E('marshal', 'Dune Marshal', 70, 5, '#e0c268', [{ t: 'hex', v: 2 }, { t: 'atk', v: 15 }, { t: 'atk2', v: 10 }]),
    spine: E('spine', 'Spine Herald', 64, 6, '#d8b0a0', [{ t: 'atk', v: 13 }, { t: 'buf', v: 3 }, { t: 'atk', v: 16 }]),
    choir: E('choir', 'Hollow Choirmaster', 136, 7, '#e8e0cc', [{ t: 'atk2', v: 12 }, { t: 'grd', v: 20 }, { t: 'atk', v: 24 }, { t: 'hex', v: 3 }]),
    mote: E('mote', 'Loom Mote', 26, 8, '#c9a9ff', [{ t: 'atk', v: 7 }, { t: 'grd', v: 6 }]),
    thorn: E('thorn', 'Thorn Effigy', 32, 1, '#a07f5a', [{ t: 'atk', v: 8 }, { t: 'atk', v: 9 }]),
    unwoven: E('unwoven', 'The Unwoven', 210, 9, '#ff6b9d', [{ t: 'atk', v: 18 }, { t: 'atk2', v: 13 }, { t: 'grd', v: 22 }, { t: 'atk', v: 28 }, { t: 'hex', v: 3 }])
  };

  /* chapters: 3 x 4 battles. index 1 of each chapter is the optional BOND fight. */
  M.CHAPTERS = [
    {
      name: 'I. THE COLD ANVIL',
      story: 'The loom-halls burned a hundred years back. You walk their ash with an empty spool and a titan asleep in your shadow.',
      battles: [
        { n: 'Ash Road', foes: ['husk', 'husk'], story: 'Rustmoth husks crawl the ash road, chewing what is left of the old thread.', reward: 'sethrin', rstory: 'The road ends at a black river. Something long and green surfaces and offers you its name: SETHRIN.' },
        { n: 'Bond: Vulmar', bond: 'vulmar', foes: ['thorn', 'thorn'], story: 'Vulmar wants his old forge cleared. Effigies squat in it. BOND FIGHT - optional.' },
        { n: 'Char Grove', foes: ['wretch', 'husk'], story: 'The grove still smoulders. A wretch of burnt brambles blocks the path.', reward: 'kaark', rstory: 'A bird made of settled ash lands on your spool. KAARK joins the weave.' },
        { n: 'The Empty Gate', foes: ['salt'], boss: 1, story: 'A revenant of dried salt guards a gate that leads nowhere. Something else guards it too.', reward: 'grendok', rstory: 'The stone hound has kept this gate alone for centuries. GRENDOK follows you now.' }
      ]
    },
    {
      name: 'II. THE GLASS MARCH',
      story: 'Beyond the gate the ground turns to fused glass. Your reflection walks a half-step behind you and does not always match.',
      battles: [
        { n: 'Fused Flats', foes: ['kin', 'kin'], story: 'Cinder kin skitter over the glass, shrieking at their own reflections.', reward: 'lumeth', rstory: 'A stag of cooled lightning steps out of the mirror-ground. LUMETH walks with you.' },
        { n: 'Bond: Sethrin', bond: 'sethrin', foes: ['mote', 'mote', 'mote'], story: 'Sethrin needs the loom motes drained to remember her deeper current. BOND FIGHT - optional.' },
        { n: 'Sandsong', foes: ['marshal', 'kin'], story: 'A marshal of the dunes calls the glass back into sand.', reward: 'thraxa', rstory: 'The dune opens one enormous eye. THRAXA has decided you are interesting.' },
        { n: 'The Glass Warden', foes: ['warden'], boss: 1, story: 'The Warden is every mirror you have passed, stacked into one shape.', reward: 'ninveil', rstory: 'From the shards a pale moth lifts, reading a future only it can see. NINVEIL joins.' }
      ]
    },
    {
      name: 'III. THE UNWOVEN',
      story: 'The last hall has no floor, only loose thread. Whatever cut the world still hangs here, patient, waiting to be finished.',
      battles: [
        { n: 'Rib Vault', foes: ['spine', 'spine'], story: 'Heralds of bone chant in a vault of ribs.', reward: 'ossivane', rstory: 'The chant resolves into one grim shape that bows to you. OSSIVANE sings for the weave.' },
        { n: 'Bond: Free Choice', bond: 'any', foes: ['mote', 'thorn', 'mote'], story: 'The loose thread will sharpen whoever you bring. BOND FIGHT - optional; upgrades your whole party.' },
        { n: 'Hollow Choir', foes: ['choir'], story: 'The Choirmaster conducts the unmaking. Silence him.' },
        { n: 'THE UNWOVEN', foes: ['unwoven', 'mote'], boss: 1, finale: 1, story: 'It is the cut itself. End it and the loom-halls hold. Fail and there is nothing left to fail in.' }
      ]
    }
  ];

  M.LVMUL = [1, 1.3, 1.65];
  M.scaleCard = function (c, lv) {
    var m = M.LVMUL[Math.max(0, Math.min(2, (lv | 0) - 1))];
    var o = { n: c.n, tag: c.tag, ig: c.ig, wa: c.wa, chain: c.chain, sd: c.sd, hits: c.hits || 1 };
    ['d', 'ad', 'b', 'h', 'bu', 'p', 'dr'].forEach(function (k) { if (c[k]) o[k] = Math.round(c[k] * m); });
    if (c.w) o.w = c.w + (lv >= 3 ? 1 : 0);
    if (c.chain) o.chain = Math.round(c.chain * m);
    return o;
  };
})();
