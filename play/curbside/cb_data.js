/* cb_data.js - Curbside content tables.
 *
 * Everything the designer touches lives here: districts, authored street
 * chunks, the three run structures, medal tiers, the unlock chain, the trick
 * book and the pickup drop table. game.js reads these and never hardcodes a
 * district or a threshold.
 *
 * BUG-CLASS NOTE (guarded keyed lookups): a shipped title hard-froze when a
 * FAMILY[variant] lookup missed. Every table here is also exported with a
 * BY_KEY map AND a resolve function that falls back to the first entry, and
 * game.js is required to use the resolver, never the raw map.
 *
 * Street piece grammar, consumed by buildChunk() in game.js:
 *   ['flat', len]                        flat street
 *   ['slope', dy, len]                   ramp (negative dy climbs)
 *   ['step', dy]                         instant curb step, dy>0 drops
 *   ['stairs', steps, rise, run, rail]   stair set, optional hand rail
 *   ['gap', len, name, points]           hole in the street; named = a Gap
 *   ['rail', len, height, name]          grindable round rail above street
 *   ['ledge', len, height, name]         grindable ledge with a solid face
 *   ['kicker', rise, len]                launch ramp
 *   ['obs', kind, offX]                  crash box prop
 *   ['prop', kind, offX]                 decorative prop, no collision
 *   ['car', kind, moving]                traffic (roof is rideable)
 *   ['pick', kind, offX, offY]           pickup
 *   ['crowd', n]                         background crowd cluster
 *   ['shortcut', height, len, name]      discoverable high line + reward
 *   ['beat', kind, label]                Line Run required beat marker
 */
(function (root) {
  'use strict';

  var D = {};

  // ------------------------------------------------------------- tricks
  // Swipe direction -> trick. `spin` is in full turns of the deck and `air`
  // is the seconds that rotation takes; the sim derives angular velocity
  // from spin/air, so `air` is the single authored truth for both how long
  // a trick needs and how readable its arc is. Nothing may set a spin rate
  // that disagrees with this table.
  D.TRICKS = [
    { key: 'kickflip',   dir: 'left',  name: 'Gutter Whip',    spin: -1,    pose: 'air',  score: 120, air: 0.42 },
    { key: 'heelflip',   dir: 'right', name: 'Backspin Curl',  spin: 1,     pose: 'air',  score: 120, air: 0.42 },
    { key: 'grab',       dir: 'up',    name: 'Skylatch Grab',  spin: 0,     pose: 'grab', score: 90,  air: 0.22 },
    { key: 'shove',      dir: 'down',  name: 'Drop Shove',     spin: -0.5,  pose: 'tuck', score: 100, air: 0.34 },
    { key: 'doubleflip', dir: 'left',  name: 'Double Whip',    spin: -2,    pose: 'air',  score: 300, air: 0.78, chain: 'kickflip' },
    { key: 'bigspin',    dir: 'right', name: 'Curbside Spin',  spin: 1.5,   pose: 'tuck', score: 260, air: 0.68, chain: 'heelflip' },
    { key: 'boneless',   dir: 'up',    name: 'Boneless Reach', spin: 0,     pose: 'grab', score: 210, air: 0.40, chain: 'grab' },
    { key: 'darkshove',  dir: 'down',  name: 'Dark Shove',     spin: -1.5,  pose: 'tuck', score: 280, air: 0.66, chain: 'shove' }
  ];

  // ------------------------------------------------------------- grinds
  D.GRINDS = [
    { key: 'fifty',    name: '50-50',       score: 40, drift: 0.85 },
    { key: 'boardsl',  name: 'Boardslide',  score: 65, drift: 1.25 },
    { key: 'crook',    name: 'Crooked',     score: 80, drift: 1.55 },
    { key: 'bluntsl',  name: 'Blunt Slide', score: 110, drift: 1.9 }
  ];

  // ------------------------------------------------------------ pickups
  // The owner always wants generous drops, so every district seeds these
  // heavily and the difficulty ramp adds more, never fewer.
  D.PICKUPS = [
    { key: 'combo', frame: 'pk_combo', name: 'COMBO EXTEND', color: 0xbc8cff,
      css: '#bc8cff', hold: 4.5, desc: 'Combo decay frozen' },
    { key: 'boost', frame: 'pk_boost', name: 'SPEED BOOST', color: 0x6eebff,
      css: '#6eebff', hold: 3.2, desc: 'Push through the block' },
    { key: 'bonus', frame: 'pk_bonus', name: 'BONUS TRICK', color: 0xffc660,
      css: '#ffc660', hold: 4.0, desc: 'Land the called trick' },
    { key: 'save',  frame: 'pk_heal',  name: 'BAIL SAVE', color: 0x8cf5c8,
      css: '#8cf5c8', hold: 0, desc: 'One bail forgiven' }
  ];

  // ============================================================ districts
  // Four authored districts plus the finale. Each has its own obstacle
  // vocabulary, chunk library, signature gap and at least one shortcut.
  function chunk(id, w, pieces, opts) {
    var c = { id: id, w: w, pieces: pieces };
    if (opts) for (var k in opts) c[k] = opts[k];
    return c;
  }

  D.DISTRICTS = [
    // ------------------------------------------------- 1. downtown
    {
      key: 'downtown',
      name: 'DOWNTOWN',
      sub: 'Stair gauntlet, taxi traffic, handrails everywhere',
      flow: 'Drop in, hit the sets, keep the rails linked.',
      music: 'music_street',
      bgFar: 'bg_downtown_far', bgNear: 'bg_downtown_near',
      sky: [0x342458, 0x121026],
      asphalt: 0x2a2740, kerb: 0x565f80, rail: 0xd6e2ff, accent: 0x78c8ff,
      accentCss: '#78c8ff',
      crowd: 0.55,
      signature: 'COURTHOUSE 14',
      shortcut: 'AWNING LINE',
      chunks: [
        chunk('dt_roll', 620, [
          ['flat', 260], ['prop', 'lamp', 60], ['obs', 'hydrant', 180],
          ['pick', 'combo', 340, 74], ['flat', 300], ['crowd', 3]
        ]),
        chunk('dt_set8', 900, [
          ['flat', 200], ['stairs', 8, 17, 30, true], ['pick', 'boost', 120, 96],
          ['flat', 340], ['obs', 'cone', 120], ['obs', 'cone', 160], ['flat', 120]
        ]),
        chunk('dt_handrail', 880, [
          ['flat', 150], ['rail', 300, 52, 'BANK RAIL'], ['pick', 'combo', 210, 96],
          ['flat', 240], ['car', 'car_taxi', 1], ['flat', 190]
        ]),
        chunk('dt_kerbs', 760, [
          ['flat', 180], ['step', 24], ['flat', 200], ['obs', 'trash', 90],
          ['step', -24], ['flat', 240], ['pick', 'bonus', 120, 78]
        ]),
        chunk('dt_double', 1080, [
          ['flat', 170], ['stairs', 5, 16, 30, true], ['flat', 210],
          ['stairs', 6, 16, 30, true], ['pick', 'boost', 140, 90], ['flat', 320],
          ['crowd', 4]
        ]),
        chunk('dt_traffic', 980, [
          ['flat', 200], ['car', 'car_sedan', 1], ['flat', 190],
          ['car', 'car_taxi', 0], ['pick', 'combo', 60, 118], ['flat', 300],
          ['obs', 'barrier', 120]
        ]),
        chunk('dt_ledgebank', 900, [
          ['flat', 160], ['ledge', 320, 40, 'BANK LEDGE'], ['pick', 'bonus', 220, 88],
          ['flat', 260], ['prop', 'sign', 90], ['flat', 160]
        ]),
        // signature centrepiece: the 14-stair with a hubba beside it
        chunk('dt_sig', 1320, [
          ['flat', 220], ['prop', 'sign', 40], ['rail', 250, 58, 'COURTHOUSE RAIL'],
          ['stairs', 14, 17, 27, false], ['gap', 150, 'COURTHOUSE 14', 900],
          ['flat', 300], ['pick', 'save', 120, 84], ['crowd', 5], ['flat', 200]
        ], { signature: true }),
        // shortcut: awnings over the stair gauntlet, entered off a kicker
        chunk('dt_short', 1180, [
          ['flat', 180], ['kicker', 54, 130],
          ['shortcut', 172, 520, 'AWNING LINE'],
          ['flat', 160], ['stairs', 7, 16, 28, true], ['flat', 320]
        ], { shortcut: true })
      ]
    },

    // ------------------------------------------------- 2. railyard
    {
      key: 'railyard',
      name: 'RAIL YARD',
      sub: 'Long steel, loading docks, no room to coast',
      flow: 'Everything is a rail. Link them or lose the line.',
      music: 'music_street',
      bgFar: 'bg_railyard_far', bgNear: 'bg_railyard_near',
      sky: [0x54332c, 0x181016],
      asphalt: 0x35292c, kerb: 0x6c5750, rail: 0xffc890, accent: 0xffa854,
      accentCss: '#ffa854',
      crowd: 0.2,
      signature: 'LOADING DOCK LEAP',
      shortcut: 'BOXCAR ROOF',
      chunks: [
        chunk('ry_yard', 720, [
          ['flat', 220], ['prop', 'stack', 60], ['obs', 'pallet', 200],
          ['flat', 260], ['pick', 'combo', 120, 76], ['flat', 200]
        ]),
        chunk('ry_long', 1040, [
          ['flat', 150], ['rail', 480, 46, 'YARD RAIL'], ['pick', 'combo', 300, 90],
          ['flat', 260], ['obs', 'crate', 140], ['flat', 160]
        ]),
        chunk('ry_twin', 1080, [
          ['flat', 160], ['rail', 260, 44, 'TWIN A'], ['flat', 130],
          ['rail', 260, 62, 'TWIN B'], ['pick', 'boost', 170, 108],
          ['flat', 280]
        ]),
        chunk('ry_dock', 940, [
          ['flat', 190], ['slope', -46, 130], ['flat', 200], ['gap', 130, '', 0],
          ['flat', 200], ['slope', 46, 130], ['pick', 'bonus', 100, 82], ['flat', 120]
        ]),
        chunk('ry_barriers', 820, [
          ['flat', 200], ['obs', 'barrier', 120], ['flat', 180],
          ['obs', 'barrier', 90], ['pick', 'combo', 130, 74], ['flat', 260]
        ]),
        chunk('ry_truck', 1000, [
          ['flat', 210], ['car', 'car_truck', 0], ['pick', 'boost', 70, 128],
          ['flat', 260], ['obs', 'crate', 110], ['flat', 240]
        ]),
        chunk('ry_ledgerun', 960, [
          ['flat', 170], ['ledge', 420, 44, 'DOCK LEDGE'], ['pick', 'bonus', 260, 86],
          ['flat', 290]
        ]),
        chunk('ry_sig', 1400, [
          ['flat', 220], ['prop', 'stack', 50], ['slope', -62, 150],
          ['rail', 200, 40, 'DOCK EDGE'],
          ['gap', 230, 'LOADING DOCK LEAP', 1200],
          ['slope', 62, 150], ['pick', 'save', 140, 82], ['flat', 340]
        ], { signature: true }),
        chunk('ry_short', 1240, [
          ['flat', 190], ['kicker', 60, 140],
          ['shortcut', 190, 560, 'BOXCAR ROOF'],
          ['flat', 200], ['obs', 'pallet', 110], ['flat', 300]
        ], { shortcut: true })
      ]
    },

    // ------------------------------------------------- 3. plaza
    {
      key: 'plaza',
      name: 'PLAZA',
      sub: 'Marble ledges, fountains, a park built for lines',
      flow: 'Low and technical. Ledges reward the long grind.',
      music: 'music_street',
      bgFar: 'bg_plaza_far', bgNear: 'bg_plaza_near',
      sky: [0x466c80, 0x121e2a],
      asphalt: 0x333f4c, kerb: 0x93a6b4, rail: 0xd8f6ea, accent: 0x8cf5c8,
      accentCss: '#8cf5c8',
      crowd: 0.85,
      signature: 'FOUNTAIN GAP',
      shortcut: 'LEDGE RIBBON',
      chunks: [
        chunk('pz_open', 700, [
          ['flat', 250], ['prop', 'planter', 90], ['prop', 'bench', 260],
          ['pick', 'combo', 380, 72], ['flat', 300], ['crowd', 5]
        ]),
        chunk('pz_hubba', 940, [
          ['flat', 160], ['ledge', 300, 36, 'MARBLE HUBBA'],
          ['pick', 'combo', 210, 80], ['flat', 200], ['stairs', 4, 15, 32, false],
          ['flat', 220]
        ]),
        chunk('pz_manual', 860, [
          ['flat', 200], ['ledge', 190, 22, 'MANUAL PAD'], ['flat', 140],
          ['ledge', 190, 22, 'SECOND PAD'], ['pick', 'bonus', 120, 66],
          ['flat', 200]
        ]),
        chunk('pz_benches', 800, [
          ['flat', 220], ['obs', 'bench', 130], ['flat', 170],
          ['obs', 'planter', 90], ['pick', 'boost', 140, 74], ['flat', 240]
        ]),
        chunk('pz_stairbank', 1000, [
          ['flat', 180], ['stairs', 6, 15, 30, true], ['flat', 200],
          ['ledge', 250, 38, 'LOWER LEDGE'], ['pick', 'combo', 170, 82],
          ['flat', 240]
        ]),
        chunk('pz_bollards', 780, [
          ['flat', 190], ['obs', 'bollard', 110], ['obs', 'bollard', 160],
          ['flat', 200], ['pick', 'bonus', 100, 70], ['flat', 220], ['crowd', 4]
        ]),
        chunk('pz_wide', 1060, [
          ['flat', 200], ['rail', 320, 44, 'PLAZA RAIL'], ['flat', 200],
          ['car', 'car_van', 0], ['pick', 'boost', 80, 122], ['flat', 260]
        ]),
        chunk('pz_sig', 1360, [
          ['flat', 240], ['prop', 'planter', 60], ['ledge', 220, 40, 'FOUNTAIN LIP'],
          ['gap', 200, 'FOUNTAIN GAP', 1050], ['flat', 240],
          ['pick', 'save', 130, 78], ['crowd', 6], ['flat', 320]
        ], { signature: true }),
        chunk('pz_short', 1220, [
          ['flat', 170], ['kicker', 48, 130],
          ['shortcut', 150, 620, 'LEDGE RIBBON'],
          ['flat', 190], ['obs', 'bench', 110], ['flat', 300]
        ], { shortcut: true })
      ]
    },

    // ------------------------------------------------- 4. boardwalk
    {
      key: 'boardwalk',
      name: 'BOARDWALK',
      sub: 'Neon pier, kicker ramps, black water underneath',
      flow: 'Fast and airborne. Ramps set up everything.',
      music: 'music_night',
      bgFar: 'bg_boardwalk_far', bgNear: 'bg_boardwalk_near',
      sky: [0x2c1a4e, 0x0a0a1c],
      asphalt: 0x2c2444, kerb: 0x6b5a94, rail: 0xffc0d8, accent: 0xff6ea0,
      accentCss: '#ff6ea0',
      crowd: 0.7,
      signature: 'PIER BREAK',
      shortcut: 'RAIL PIER',
      chunks: [
        chunk('bw_deck', 720, [
          ['flat', 240], ['prop', 'palm', 80], ['prop', 'sign', 300],
          ['pick', 'combo', 380, 74], ['flat', 320], ['crowd', 4]
        ]),
        chunk('bw_kick', 900, [
          ['flat', 200], ['kicker', 50, 130], ['gap', 130, '', 0],
          ['flat', 260], ['pick', 'boost', 120, 100], ['flat', 200]
        ]),
        chunk('bw_pierrail', 1000, [
          ['flat', 170], ['rail', 380, 50, 'PIER RAIL'], ['pick', 'combo', 250, 96],
          ['flat', 260], ['obs', 'bollard', 120], ['flat', 160]
        ]),
        chunk('bw_double', 1080, [
          ['flat', 180], ['kicker', 46, 120], ['gap', 120, '', 0], ['flat', 170],
          ['kicker', 52, 120], ['gap', 140, '', 0], ['pick', 'bonus', 90, 96],
          ['flat', 300]
        ]),
        chunk('bw_stalls', 840, [
          ['flat', 210], ['obs', 'crate', 120], ['prop', 'palm', 220],
          ['flat', 190], ['obs', 'cone', 90], ['pick', 'combo', 140, 72],
          ['flat', 240]
        ]),
        chunk('bw_ledge', 940, [
          ['flat', 190], ['ledge', 330, 42, 'BOARD LEDGE'],
          ['pick', 'bonus', 230, 88], ['flat', 250], ['crowd', 5], ['flat', 160]
        ]),
        chunk('bw_van', 960, [
          ['flat', 220], ['car', 'car_van', 1], ['pick', 'boost', 70, 126],
          ['flat', 280], ['obs', 'trash', 100], ['flat', 220]
        ]),
        chunk('bw_sig', 1420, [
          ['flat', 230], ['prop', 'palm', 70], ['kicker', 66, 160],
          ['gap', 300, 'PIER BREAK', 1500], ['flat', 260],
          ['pick', 'save', 140, 84], ['crowd', 6], ['flat', 340]
        ], { signature: true }),
        chunk('bw_short', 1260, [
          ['flat', 180], ['kicker', 58, 140],
          ['shortcut', 182, 600, 'RAIL PIER'],
          ['flat', 200], ['obs', 'cone', 110], ['flat', 300]
        ], { shortcut: true })
      ]
    },

    // ------------------------------------------------- 5. the mile (finale)
    {
      key: 'mile',
      name: 'THE CURBSIDE MILE',
      sub: 'Every district, end to end, no let up',
      flow: 'The finale line. Everything you learned, in order.',
      music: 'music_night',
      bgFar: 'bg_mile_far', bgNear: 'bg_mile_near',
      sky: [0x4a2860, 0x0e0c1e],
      asphalt: 0x2f2544, kerb: 0x7a6398, rail: 0xffe0a8, accent: 0xffd678,
      accentCss: '#ffd678',
      crowd: 1.0,
      finale: true,
      signature: 'THE MILE DROP',
      shortcut: 'ROOFTOP MILE',
      chunks: [
        chunk('ml_open', 780, [
          ['flat', 240], ['prop', 'sign', 70], ['rail', 240, 50, 'OPENING RAIL'],
          ['pick', 'combo', 160, 92], ['flat', 300], ['crowd', 6]
        ]),
        chunk('ml_gauntlet', 1160, [
          ['flat', 180], ['stairs', 10, 17, 28, true], ['flat', 200],
          ['ledge', 260, 40, 'MILE LEDGE'], ['pick', 'boost', 180, 84],
          ['flat', 280]
        ]),
        chunk('ml_yard', 1080, [
          ['flat', 170], ['rail', 420, 48, 'MILE STEEL'], ['pick', 'combo', 280, 92],
          ['flat', 210], ['car', 'car_truck', 1], ['flat', 220]
        ]),
        chunk('ml_air', 1120, [
          ['flat', 180], ['kicker', 56, 140], ['gap', 190, '', 0], ['flat', 190],
          ['kicker', 60, 140], ['gap', 210, '', 0], ['pick', 'bonus', 100, 100],
          ['flat', 280]
        ]),
        chunk('ml_plaza', 1020, [
          ['flat', 190], ['ledge', 300, 36, 'MILE MARBLE'], ['flat', 150],
          ['obs', 'bench', 90], ['pick', 'combo', 150, 74], ['flat', 260],
          ['crowd', 6]
        ]),
        chunk('ml_traffic', 1040, [
          ['flat', 200], ['car', 'car_taxi', 1], ['flat', 180],
          ['car', 'car_sedan', 1], ['pick', 'boost', 80, 122], ['flat', 300],
          ['obs', 'barrier', 120]
        ]),
        chunk('ml_sig', 1520, [
          ['flat', 240], ['prop', 'sign', 60], ['slope', -70, 170],
          ['rail', 220, 42, 'MILE EDGE'],
          ['gap', 330, 'THE MILE DROP', 2000], ['slope', 70, 170],
          ['pick', 'save', 150, 82], ['crowd', 7], ['flat', 340]
        ], { signature: true }),
        chunk('ml_short', 1320, [
          ['flat', 190], ['kicker', 64, 150],
          ['shortcut', 205, 660, 'ROOFTOP MILE'],
          ['flat', 210], ['obs', 'crate', 120], ['flat', 320]
        ], { shortcut: true })
      ]
    }
  ];

  // ---------------------------------------------------------- line runs
  // Line Run is a memorise-and-execute fixed sequence. The pieces are
  // authored in order with 'beat' markers; a beat is satisfied by doing the
  // named action anywhere inside the beat's zone.
  D.LINES = {
    downtown: {
      name: 'COURTHOUSE LINE', par: 6,
      pieces: [
        ['flat', 340], ['beat', 'trick', 'POP A TRICK'], ['flat', 120],
        ['rail', 300, 52, 'OPENER'], ['beat', 'grind', 'GRIND THE RAIL'],
        ['flat', 200], ['stairs', 8, 17, 30, false],
        ['gap', 120, 'STAIR CLEAR', 500], ['beat', 'gap', 'CLEAR THE SET'],
        ['flat', 240], ['pick', 'combo', 90, 76],
        ['ledge', 280, 40, 'HUBBA'], ['beat', 'grind', 'HUBBA GRIND'],
        ['flat', 200], ['kicker', 52, 130], ['gap', 150, 'CAB GAP', 700],
        ['beat', 'gap', 'GAP THE CAB'], ['flat', 220],
        ['beat', 'trick', 'FINISH CLEAN'], ['flat', 460]
      ]
    },
    railyard: {
      name: 'DOCK LINE', par: 6,
      pieces: [
        ['flat', 320], ['rail', 380, 46, 'FIRST STEEL'],
        ['beat', 'grind', 'LOCK THE STEEL'], ['flat', 200],
        ['beat', 'trick', 'FLIP IT'], ['flat', 160],
        ['slope', -50, 140], ['gap', 170, 'DOCK GAP', 800],
        ['beat', 'gap', 'CROSS THE DOCK'], ['slope', 50, 140], ['flat', 200],
        ['pick', 'boost', 80, 84], ['ledge', 320, 44, 'DOCK LEDGE'],
        ['beat', 'grind', 'RIDE THE LEDGE'], ['flat', 210],
        ['obs', 'crate', 110], ['beat', 'trick', 'OVER THE CRATE'],
        ['flat', 240], ['rail', 260, 62, 'HIGH STEEL'],
        ['beat', 'grind', 'HIGH STEEL'], ['flat', 460]
      ]
    },
    plaza: {
      name: 'MARBLE LINE', par: 6,
      pieces: [
        ['flat', 300], ['ledge', 200, 22, 'PAD ONE'],
        ['beat', 'grind', 'PAD ONE'], ['flat', 140],
        ['ledge', 200, 22, 'PAD TWO'], ['beat', 'grind', 'PAD TWO'],
        ['flat', 190], ['beat', 'trick', 'TECH TRICK'], ['flat', 150],
        ['stairs', 5, 15, 30, true], ['gap', 110, 'PLAZA FIVE', 480],
        ['beat', 'gap', 'PLAZA FIVE'], ['flat', 220],
        ['pick', 'combo', 90, 74], ['ledge', 320, 38, 'LONG MARBLE'],
        ['beat', 'grind', 'LONG MARBLE'], ['flat', 240],
        ['beat', 'trick', 'CLOSE IT OUT'], ['flat', 460]
      ]
    },
    boardwalk: {
      name: 'PIER LINE', par: 6,
      pieces: [
        ['flat', 320], ['kicker', 48, 130], ['gap', 140, 'FIRST BREAK', 600],
        ['beat', 'gap', 'FIRST BREAK'], ['flat', 200],
        ['beat', 'trick', 'AIR TRICK'], ['flat', 150],
        ['rail', 360, 50, 'PIER STEEL'], ['beat', 'grind', 'PIER STEEL'],
        ['flat', 220], ['pick', 'boost', 90, 86],
        ['kicker', 58, 140], ['gap', 220, 'THE BREAK', 950],
        ['beat', 'gap', 'THE BREAK'], ['flat', 230],
        ['ledge', 280, 42, 'NEON LEDGE'], ['beat', 'grind', 'NEON LEDGE'],
        ['flat', 200], ['beat', 'trick', 'LAND IT CLEAN'], ['flat', 460]
      ]
    },
    mile: {
      name: 'THE MILE', par: 9,
      pieces: [
        ['flat', 300], ['rail', 300, 50, 'MILE OPENER'],
        ['beat', 'grind', 'OPEN THE MILE'], ['flat', 180],
        ['beat', 'trick', 'FIRST FLIP'], ['flat', 150],
        ['stairs', 10, 17, 28, false], ['gap', 150, 'MILE TEN', 700],
        ['beat', 'gap', 'MILE TEN'], ['flat', 200],
        ['ledge', 300, 40, 'MILE MARBLE'], ['beat', 'grind', 'MILE MARBLE'],
        ['flat', 190], ['pick', 'combo', 80, 76],
        ['kicker', 56, 140], ['gap', 200, 'MILE AIR', 900],
        ['beat', 'gap', 'MILE AIR'], ['flat', 200],
        ['beat', 'trick', 'MID-LINE TRICK'], ['flat', 170],
        ['rail', 340, 60, 'HIGH MILE'], ['beat', 'grind', 'HIGH MILE'],
        ['flat', 220], ['pick', 'boost', 80, 84],
        ['slope', -64, 160], ['gap', 260, 'THE MILE DROP', 1400],
        ['beat', 'gap', 'THE MILE DROP'], ['slope', 64, 160], ['flat', 220],
        ['beat', 'trick', 'BANK THE MILE'], ['flat', 520]
      ]
    }
  };

  // ------------------------------------------------------------- modes
  D.MODES = [
    { key: 'score', name: 'SCORE ATTACK', short: 'SCORE',
      blurb: 'Ninety seconds. Chase one enormous combo.',
      timed: 90 },
    { key: 'gap', name: 'GAP CHALLENGE', short: 'GAPS',
      blurb: 'Clear the named gaps before the clock runs out.',
      timed: 100 },
    { key: 'line', name: 'LINE RUN', short: 'LINE',
      blurb: 'A fixed line. Memorise it, then execute every beat.',
      timed: 0 }
  ];

  // -------------------------------------------------- challenge registry
  // districtIndex x mode, with medal tiers. The unlock chain runs straight
  // down this list, so index order IS the progression.
  function ch(district, mode, bronze, silver, gold) {
    return { key: district + ':' + mode, district: district, mode: mode,
             tiers: [bronze, silver, gold] };
  }

  D.CHALLENGES = [
    ch('downtown', 'score', 5000, 14000, 30000),
    ch('downtown', 'gap', 2, 4, 6),
    ch('downtown', 'line', 3, 5, 6),
    ch('railyard', 'score', 6000, 17000, 36000),
    ch('railyard', 'gap', 3, 5, 7),
    ch('railyard', 'line', 3, 5, 6),
    ch('plaza', 'score', 7000, 20000, 42000),
    ch('plaza', 'gap', 3, 5, 7),
    ch('plaza', 'line', 3, 5, 6),
    ch('boardwalk', 'score', 8000, 24000, 50000),
    ch('boardwalk', 'gap', 3, 6, 8),
    ch('boardwalk', 'line', 3, 5, 6),
    ch('mile', 'score', 11000, 32000, 68000),
    ch('mile', 'gap', 4, 6, 9),
    ch('mile', 'line', 5, 7, 9)
  ];

  // Named street gaps the Gap Challenge seeds between authored chunks, so
  // the mode always has a list to chase and never depends on the signature
  // centrepiece coming round.
  D.STREET_GAPS = [
    { name: 'CURB GAP', len: 118, points: 260 },
    { name: 'ALLEY GAP', len: 142, points: 340 },
    { name: 'DRIVEWAY GAP', len: 160, points: 400 },
    { name: 'SIDE STREET', len: 182, points: 470 },
    { name: 'SERVICE LANE', len: 200, points: 540 },
    { name: 'CROSSING', len: 134, points: 300 }
  ];

  // The finale district stays locked until every earlier line run is cleared.
  D.FINALE_DISTRICT = 'mile';
  D.MEDAL_NAMES = ['BRONZE', 'SILVER', 'GOLD'];

  // ---------------------------------------------------------- liveries
  D.LIVERIES = [
    { key: 'slate', frame: 'deck_slate', name: 'CITY SLATE', need: 0 },
    { key: 'ember', frame: 'deck_ember', name: 'EMBER', need: 3 },
    { key: 'mint',  frame: 'deck_mint',  name: 'YARD MINT', need: 8 },
    { key: 'neon',  frame: 'deck_neon',  name: 'PIER NEON', need: 15 },
    { key: 'bone',  frame: 'deck_bone',  name: 'BONE CLASSIC', need: 24 }
  ];

  // ------------------------------------------------------ safe resolvers
  // Guarded lookups. Every consumer in game.js goes through these, so a
  // miss degrades to the first table entry instead of throwing.
  function indexBy(list, field) {
    var m = {};
    for (var i = 0; i < list.length; i++) m[list[i][field]] = list[i];
    return m;
  }
  function resolver(list, map) {
    return function (key) {
      var hit = (key != null) ? map[key] : null;
      return hit || list[0];
    };
  }

  D.DISTRICT_BY_KEY = indexBy(D.DISTRICTS, 'key');
  D.MODE_BY_KEY = indexBy(D.MODES, 'key');
  D.TRICK_BY_KEY = indexBy(D.TRICKS, 'key');
  D.GRIND_BY_KEY = indexBy(D.GRINDS, 'key');
  D.PICKUP_BY_KEY = indexBy(D.PICKUPS, 'key');
  D.LIVERY_BY_KEY = indexBy(D.LIVERIES, 'key');
  D.CHALLENGE_BY_KEY = indexBy(D.CHALLENGES, 'key');

  D.district = resolver(D.DISTRICTS, D.DISTRICT_BY_KEY);
  D.mode = resolver(D.MODES, D.MODE_BY_KEY);
  D.trick = resolver(D.TRICKS, D.TRICK_BY_KEY);
  D.grind = resolver(D.GRINDS, D.GRIND_BY_KEY);
  D.pickup = resolver(D.PICKUPS, D.PICKUP_BY_KEY);
  D.livery = resolver(D.LIVERIES, D.LIVERY_BY_KEY);
  D.challenge = resolver(D.CHALLENGES, D.CHALLENGE_BY_KEY);
  D.line = function (districtKey) {
    return D.LINES[districtKey] || D.LINES.downtown;
  };
  D.districtIndex = function (key) {
    for (var i = 0; i < D.DISTRICTS.length; i++) {
      if (D.DISTRICTS[i].key === key) return i;
    }
    return 0;
  };

  root.CB_DATA = D;
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
})(typeof window !== 'undefined' ? window : globalThis);
