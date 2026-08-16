/* Ironsight Ops - io_content.js
 * Authored content graph: weapons, gadgets, enemy classes, the four
 * theatres, the nine Operations missions, Survival and the shoot house,
 * plus the unlock table.
 *
 * Theatres are authored as CELL ops on a 35x21 grid of 40 unit cells
 * (1400 x 840 world units). Ops are hand placed to create sightlines,
 * breach points and flanking lanes; nothing here is generated at random.
 * Every keyed lookup in this file has a guarded accessor at the bottom,
 * because a missing variant key hard froze a shipped title in this fleet.
 */
var IOContent = (function () {
  'use strict';

  var CELL = 40;
  var COLS = 35;
  var ROWS = 21;

  /* ------------------------------------------------------------ weapons */
  /* Prototype tuning carried forward verbatim where it existed:
   * ar damage 16 / cooldown .12 / range 350 / spread .042,
   * smg 10 / .075 / 255 / .10, dmr 31 / .38 / 520 / .018.
   * Everything else (magazines, reload discipline, bloom, penetration)
   * is new tuning layered on top of those numbers. */
  var WEAPONS = {
    ar: {
      id: 'ar', name: 'Vector 7', kind: 'primary', slot: 'primary',
      damage: 16, cooldown: 0.12, range: 350, spread: 0.042,
      bloomShot: 0.020, bloomMax: 0.115, bloomDecay: 0.26, moveBloom: 0.030,
      mag: 30, reserve: 210, reloadTac: 1.55, reloadEmpty: 2.05, raise: 0.42,
      pellets: 1, pierce: 0.55, kick: 2.2, shake: 1.1, sfx: 'shot_ar',
      tint: 0xffd47b, auto: true, desc: 'Balanced rifle. Burst it and the bloom stays honest.'
    },
    smg: {
      id: 'smg', name: 'Rasp 9', kind: 'primary', slot: 'primary',
      damage: 10, cooldown: 0.075, range: 255, spread: 0.10,
      bloomShot: 0.016, bloomMax: 0.150, bloomDecay: 0.34, moveBloom: 0.014,
      mag: 32, reserve: 260, reloadTac: 1.35, reloadEmpty: 1.85, raise: 0.34,
      pellets: 1, pierce: 0.35, kick: 1.5, shake: 0.8, sfx: 'shot_smg',
      tint: 0x77d7ff, auto: true, desc: 'Close work. Moves fast, punishes distance.'
    },
    dmr: {
      id: 'dmr', name: 'Longshot', kind: 'primary', slot: 'primary',
      damage: 31, cooldown: 0.38, range: 520, spread: 0.018,
      bloomShot: 0.034, bloomMax: 0.120, bloomDecay: 0.30, moveBloom: 0.052,
      mag: 12, reserve: 84, reloadTac: 1.85, reloadEmpty: 2.35, raise: 0.55,
      pellets: 1, pierce: 0.85, kick: 4.2, shake: 2.0, sfx: 'shot_dmr',
      tint: 0xf9f2d0, auto: true, desc: 'Marksman rifle. Pierces cover, hates hurry.'
    },
    sg: {
      id: 'sg', name: 'Breacher', kind: 'primary', slot: 'primary',
      damage: 9, cooldown: 0.62, range: 165, spread: 0.16,
      bloomShot: 0.030, bloomMax: 0.110, bloomDecay: 0.40, moveBloom: 0.020,
      mag: 6, reserve: 54, reloadTac: 2.10, reloadEmpty: 2.40, raise: 0.46,
      pellets: 8, pierce: 0.15, kick: 5.0, shake: 2.4, sfx: 'shot_sg',
      tint: 0xffa96b, auto: false, desc: 'Room clearer. Eight pellets, no patience.'
    },
    pistol: {
      id: 'pistol', name: 'Sidearm 45', kind: 'secondary', slot: 'secondary',
      damage: 14, cooldown: 0.18, range: 240, spread: 0.038,
      bloomShot: 0.024, bloomMax: 0.110, bloomDecay: 0.36, moveBloom: 0.022,
      mag: 12, reserve: 96, reloadTac: 1.15, reloadEmpty: 1.55, raise: 0.26,
      pellets: 1, pierce: 0.30, kick: 2.4, shake: 0.9, sfx: 'shot_pistol',
      tint: 0xd8e2ea, auto: false, desc: 'Fast to raise. The answer to an empty magazine.'
    },
    stub: {
      id: 'stub', name: 'Stub 20', kind: 'secondary', slot: 'secondary',
      damage: 9, cooldown: 0.07, range: 190, spread: 0.115,
      bloomShot: 0.018, bloomMax: 0.160, bloomDecay: 0.40, moveBloom: 0.016,
      mag: 20, reserve: 140, reloadTac: 1.20, reloadEmpty: 1.60, raise: 0.24,
      pellets: 1, pierce: 0.25, kick: 1.4, shake: 0.7, sfx: 'shot_smg',
      tint: 0x9ee6c8, auto: true, desc: 'Machine pistol. A panic button with a magazine.'
    }
  };
  var PRIMARY_ORDER = ['ar', 'smg', 'dmr', 'sg'];
  var SECONDARY_ORDER = ['pistol', 'stub'];

  /* ------------------------------------------------------------ gadgets */
  var GADGETS = {
    frag: {
      id: 'frag', name: 'Frag', icon: 'frag', charges: 2, throwRange: 150,
      fuse: 0.72, radius: 84, damage: 88, tint: 0xffbd66,
      desc: 'Cooked frag. Clears a corner, not a wall.'
    },
    smoke: {
      id: 'smoke', name: 'Smoke', icon: 'smoke', charges: 2, throwRange: 150,
      fuse: 0.35, radius: 74, life: 8.0, tint: 0xb9d4d0,
      desc: 'Breaks every sightline through it, both ways.'
    },
    flash: {
      id: 'flash', name: 'Flashbang', icon: 'flash', charges: 2, throwRange: 165,
      fuse: 0.9, radius: 150, blind: 3.4, tint: 0xfff3c4,
      desc: 'Blinds and suppresses. Hostiles stop shooting straight.'
    },
    ping: {
      id: 'ping', name: 'Drone Ping', icon: 'ping', charges: 3, throwRange: 0,
      fuse: 0, life: 7.0, tint: 0xe2b269,
      desc: 'Marks every hostile on the floor for seven seconds.'
    }
  };
  var GADGET_ORDER = ['frag', 'smoke', 'flash', 'ping'];

  /* ------------------------------------------------- enemy classes */
  var ENEMIES = {
    rifleman: {
      id: 'rifleman', name: 'Rifleman', hp: 64, speed: 66, weapon: 'ar',
      accuracy: 0.62, burst: 4, burstGap: 0.62, react: 0.34, tint: 0xff8d7a,
      cover: 0.75, suppressible: 1.0, score: 100
    },
    rusher: {
      id: 'rusher', name: 'Rusher', hp: 52, speed: 92, weapon: 'smg',
      accuracy: 0.48, burst: 8, burstGap: 0.48, react: 0.26, tint: 0xffb35e,
      cover: 0.25, suppressible: 0.8, score: 110
    },
    marksman: {
      id: 'marksman', name: 'Marksman', hp: 58, speed: 52, weapon: 'dmr',
      accuracy: 0.80, burst: 1, burstGap: 1.05, react: 0.52, tint: 0xc79bff,
      cover: 0.92, suppressible: 1.25, score: 140
    },
    heavy: {
      id: 'heavy', name: 'Shield', hp: 130, speed: 46, weapon: 'sg',
      accuracy: 0.55, burst: 2, burstGap: 0.9, react: 0.44, tint: 0x7fb0ff,
      cover: 0.4, suppressible: 0.45, score: 190, shield: 0.55
    },
    target: {
      id: 'target', name: 'Target', hp: 1, speed: 0, weapon: 'pistol',
      accuracy: 0, burst: 0, burstGap: 99, react: 99, tint: 0xffe27a,
      cover: 0, suppressible: 0, score: 50, inert: true
    }
  };

  /* ------------------------------------------------------- theatres */
  /* op codes: w wall (solid), c crate (penetrable, destructible),
   * g glass (blocks movement, not sight), b barrel (explosive),
   * l lamp (light only). Rect ops are [code, x, y, w, h]; point ops
   * are [code, x, y]. */
  var THEATRES = {
    harbour: {
      id: 'harbour', name: 'Harbour Warehouse',
      mood: {
        floor: 0x16262d, floorAlt: 0x1b2f38, grout: 0x0e1a20, wall: 0x2b4048,
        wallTop: 0x3f5f6b, edge: 0x0a1319, accent: 0x51d3ba, decal: 0x27424c,
        ambient: 0x0a1c26, ambientAlpha: 0.30, lamp: 0xffd9a0, lampAlpha: 0.42,
        fog: 0x0d1f28, sky: '#0b171d'
      },
      start: [2.5, 18.5],
      ops: [
        ['w', 6, 2, 1, 6], ['w', 6, 2, 7, 1], ['w', 12, 2, 1, 6],
        ['w', 6, 7, 2, 1], ['w', 10, 7, 3, 1], ['g', 8, 7, 2, 1],
        ['w', 17, 1, 1, 7], ['w', 20, 8, 7, 1], ['w', 26, 8, 1, 5],
        ['w', 22, 4, 6, 1], ['w', 30, 4, 1, 7], ['w', 5, 11, 1, 6],
        ['w', 5, 16, 8, 1], ['w', 13, 11, 1, 6], ['w', 18, 13, 8, 1],
        ['w', 30, 14, 1, 5], ['w', 22, 18, 9, 1],
        ['c', 9, 10, 4, 1], ['c', 15, 5, 1, 3], ['c', 19, 2, 3, 1],
        ['c', 24, 10, 3, 1], ['c', 8, 13, 2, 1], ['c', 16, 17, 4, 1],
        ['c', 21, 15, 1, 3], ['c', 28, 2, 2, 1], ['c', 3, 8, 1, 3],
        ['c', 32, 12, 1, 4], ['c', 14, 9, 1, 2], ['c', 27, 16, 2, 1],
        ['g', 17, 9, 1, 3], ['g', 22, 5, 1, 3],
        ['b', 14, 3], ['b', 21, 11], ['b', 27, 17], ['b', 11, 18], ['b', 31, 6],
        ['b', 8, 9], ['b', 19, 19],
        ['l', 9, 4], ['l', 20, 3], ['l', 29, 8], ['l', 9, 14], ['l', 20, 16],
        ['l', 32, 18], ['l', 3, 6], ['l', 24, 12]
      ],
      spawns: [
        [32, 2], [28, 6], [24, 2], [19, 6], [33, 10], [24, 15], [31, 20],
        [18, 19], [14, 15], [8, 3], [2, 12], [12, 20]
      ],
      anchors: {
        1: [10, 5], 2: [24, 6], 3: [9, 14], 4: [20, 11], 5: [28, 15],
        6: [33, 4], 7: [3, 3], 8: [16, 2], 9: [2, 18]
      }
    },

    embassy: {
      id: 'embassy', name: 'Night Embassy',
      mood: {
        floor: 0x241f2c, floorAlt: 0x2c2536, grout: 0x171320, wall: 0x3a3149,
        wallTop: 0x554870, edge: 0x120e1a, accent: 0xc79bff, decal: 0x392f4a,
        ambient: 0x140e22, ambientAlpha: 0.38, lamp: 0xbfa6ff, lampAlpha: 0.40,
        fog: 0x1a1428, sky: '#120d1c'
      },
      start: [17, 19.5],
      ops: [
        ['w', 3, 3, 10, 1], ['w', 3, 3, 1, 6], ['w', 3, 8, 4, 1], ['w', 9, 8, 4, 1],
        ['w', 12, 3, 1, 6], ['g', 7, 8, 2, 1],
        ['w', 22, 3, 10, 1], ['w', 31, 3, 1, 6], ['w', 22, 8, 4, 1], ['w', 28, 8, 4, 1],
        ['w', 22, 3, 1, 6], ['g', 26, 8, 2, 1],
        ['w', 15, 6, 5, 1], ['w', 15, 6, 1, 4], ['w', 19, 6, 1, 4],
        ['w', 8, 12, 1, 6], ['w', 8, 12, 6, 1], ['w', 13, 15, 1, 3],
        ['w', 21, 12, 6, 1], ['w', 26, 12, 1, 6], ['w', 21, 15, 1, 3],
        ['w', 14, 12, 1, 2], ['w', 20, 12, 1, 2],
        ['c', 5, 5, 2, 1], ['c', 10, 5, 2, 1], ['c', 24, 5, 2, 1], ['c', 29, 5, 2, 1],
        ['c', 16, 12, 3, 1], ['c', 10, 17, 2, 1], ['c', 23, 17, 2, 1],
        ['c', 2, 11, 1, 3], ['c', 32, 11, 1, 3], ['c', 16, 3, 3, 1],
        ['c', 5, 19, 3, 1], ['c', 27, 19, 3, 1],
        ['g', 15, 10, 5, 1], ['g', 2, 16, 1, 3], ['g', 32, 16, 1, 3],
        ['b', 6, 10], ['b', 28, 10], ['b', 17, 17], ['b', 11, 2], ['b', 24, 2],
        ['l', 5, 5], ['l', 10, 5], ['l', 17, 8], ['l', 24, 5], ['l', 29, 5],
        ['l', 5, 15], ['l', 29, 15], ['l', 17, 19], ['l', 11, 12], ['l', 23, 12]
      ],
      spawns: [
        [5, 5], [10, 5], [24, 5], [29, 5], [17, 2], [2, 9], [32, 9],
        [11, 13], [23, 13], [17, 13], [3, 19], [31, 19]
      ],
      anchors: {
        1: [17, 8], 2: [5, 6], 3: [29, 6], 4: [11, 14], 5: [23, 14],
        6: [17, 2], 7: [2, 19], 8: [32, 19], 9: [17, 19]
      }
    },

    desert: {
      id: 'desert', name: 'Desert Compound',
      mood: {
        floor: 0x3b2e20, floorAlt: 0x4a3a28, grout: 0x241b12, wall: 0x6a5238,
        wallTop: 0x8d6f4c, edge: 0x1d1610, accent: 0xffc266, decal: 0x574128,
        ambient: 0x3a2a12, ambientAlpha: 0.22, lamp: 0xffe1a8, lampAlpha: 0.30,
        fog: 0x4a3620, sky: '#2c2013'
      },
      start: [2.5, 10.5],
      ops: [
        ['w', 7, 2, 1, 7], ['w', 7, 2, 6, 1], ['w', 12, 2, 1, 4],
        ['w', 7, 8, 3, 1], ['w', 11, 8, 2, 1],
        ['w', 7, 12, 1, 7], ['w', 7, 18, 6, 1], ['w', 12, 14, 1, 5],
        ['w', 7, 12, 4, 1], ['g', 11, 12, 2, 1],
        ['w', 16, 5, 1, 11], ['w', 16, 5, 5, 1], ['w', 16, 15, 5, 1],
        ['w', 20, 5, 1, 4], ['w', 20, 12, 1, 4], ['g', 20, 9, 1, 3],
        ['w', 25, 2, 1, 8], ['w', 25, 2, 7, 1], ['w', 31, 2, 1, 8],
        ['w', 25, 9, 2, 1], ['w', 29, 9, 3, 1],
        ['w', 25, 13, 7, 1], ['w', 25, 13, 1, 6], ['w', 31, 13, 1, 6],
        ['w', 25, 18, 2, 1], ['w', 29, 18, 3, 1],
        ['c', 3, 5, 1, 3], ['c', 3, 14, 1, 3], ['c', 9, 4, 2, 1],
        ['c', 9, 15, 2, 1], ['c', 14, 8, 1, 3], ['c', 22, 6, 1, 3],
        ['c', 22, 14, 1, 3], ['c', 27, 5, 3, 1], ['c', 27, 15, 3, 1],
        ['c', 17, 18, 4, 1], ['c', 17, 2, 4, 1], ['c', 33, 8, 1, 5],
        ['b', 10, 6], ['b', 10, 16], ['b', 18, 10], ['b', 28, 7], ['b', 28, 16],
        ['b', 14, 19], ['b', 22, 2],
        ['l', 10, 5], ['l', 10, 15], ['l', 18, 3], ['l', 18, 18], ['l', 28, 6],
        ['l', 28, 16], ['l', 3, 10], ['l', 33, 10]
      ],
      spawns: [
        [33, 3], [33, 18], [28, 6], [28, 16], [18, 3], [18, 18], [22, 10],
        [10, 5], [10, 16], [14, 12], [24, 11], [31, 10]
      ],
      anchors: {
        1: [14, 10], 2: [28, 6], 3: [28, 16], 4: [18, 10], 5: [10, 5],
        6: [10, 16], 7: [33, 10], 8: [22, 19], 9: [2, 10]
      }
    },

    subway: {
      id: 'subway', name: 'Meridian Subway',
      mood: {
        floor: 0x1b2230, floorAlt: 0x222c3c, grout: 0x0d1220, wall: 0x323e54,
        wallTop: 0x4b5c78, edge: 0x080c14, accent: 0x6fe3ff, decal: 0x2a374b,
        ambient: 0x0a1120, ambientAlpha: 0.34, lamp: 0xa8e6ff, lampAlpha: 0.44,
        fog: 0x101a2a, sky: '#080d16'
      },
      start: [2.5, 10.5],
      ops: [
        ['w', 1, 5, 34, 1], ['w', 1, 15, 34, 1],
        ['w', 6, 6, 1, 3], ['w', 6, 12, 1, 3],
        ['w', 12, 6, 1, 3], ['w', 12, 12, 1, 3],
        ['w', 18, 6, 1, 3], ['w', 18, 12, 1, 3],
        ['w', 24, 6, 1, 3], ['w', 24, 12, 1, 3],
        ['w', 30, 6, 1, 3], ['w', 30, 12, 1, 3],
        ['w', 9, 2, 1, 3], ['w', 15, 2, 1, 3], ['w', 21, 16, 1, 3], ['w', 27, 16, 1, 3],
        ['w', 9, 2, 7, 1], ['w', 21, 18, 7, 1],
        ['c', 3, 8, 1, 5], ['c', 9, 9, 1, 3], ['c', 15, 9, 1, 3],
        ['c', 21, 9, 1, 3], ['c', 27, 9, 1, 3], ['c', 33, 8, 1, 5],
        ['c', 4, 2, 3, 1], ['c', 17, 2, 3, 1], ['c', 30, 2, 3, 1],
        ['c', 4, 18, 3, 1], ['c', 14, 18, 3, 1], ['c', 30, 18, 3, 1],
        ['g', 10, 5, 2, 1], ['g', 22, 15, 2, 1],
        ['b', 8, 10], ['b', 20, 10], ['b', 32, 10], ['b', 6, 3], ['b', 29, 17],
        ['l', 4, 10], ['l', 10, 10], ['l', 16, 10], ['l', 22, 10], ['l', 28, 10],
        ['l', 33, 10], ['l', 12, 3], ['l', 24, 17]
      ],
      spawns: [
        [33, 10], [30, 10], [27, 3], [27, 17], [21, 3], [21, 17],
        [15, 17], [15, 3], [9, 17], [33, 3], [33, 17], [24, 10]
      ],
      anchors: {
        1: [17, 10], 2: [27, 10], 3: [9, 10], 4: [24, 17], 5: [12, 3],
        6: [33, 10], 7: [21, 3], 8: [30, 17], 9: [2, 10]
      }
    }
  };
  var THEATRE_ORDER = ['harbour', 'embassy', 'desert', 'subway'];

  /* ------------------------------------------------------- missions */
  /* Nine Operations missions. Every stage carries its own coach line, HUD
   * icon and spawn budget; difficulty is the accuracy and aggression scale
   * applied to every hostile in that mission. */
  var MISSIONS = [
    {
      id: 'op1', no: 1, name: 'Cold Open', theatre: 'harbour', difficulty: 0.55,
      par: 150, intel: 2, tutorial: true,
      brief: 'Warehouse door is cold. Breach it, clear the floor, leave nothing behind you.',
      intelAt: [3, 6],
      stages: [
        { kind: 'breach', anchor: 1, time: 1.6, icon: 'breach',
          text: 'Set the breach charge',
          spawn: [{ kind: 'rifleman', n: 2, near: 2 }] },
        { kind: 'clear', count: 5, icon: 'skull', text: 'Clear the warehouse floor',
          spawn: [{ kind: 'rifleman', n: 3, near: 2 }, { kind: 'rusher', n: 2, near: 4 }] },
        { kind: 'extract', anchor: 9, icon: 'extract', text: 'Fall back to the dock exit' }
      ]
    },
    {
      id: 'op2', no: 2, name: 'Dockside Sweep', theatre: 'harbour', difficulty: 0.64,
      par: 175, intel: 3,
      brief: 'Two charges wired to the dock pilings. Cut them both before the tide crew arrives.',
      intelAt: [7, 5, 8],
      stages: [
        { kind: 'defuse', anchor: 2, time: 2.4, icon: 'defuse', text: 'Cut the first charge',
          spawn: [{ kind: 'rifleman', n: 3, near: 2 }, { kind: 'marksman', n: 1, near: 6 }] },
        { kind: 'defuse', anchor: 3, time: 2.4, icon: 'defuse', text: 'Cut the second charge',
          spawn: [{ kind: 'rifleman', n: 3, near: 3 }, { kind: 'rusher', n: 2, near: 5 }] },
        { kind: 'extract', anchor: 9, icon: 'extract', text: 'Exit the dock' }
      ]
    },
    {
      id: 'op3', no: 3, name: 'Quiet Entry', theatre: 'embassy', difficulty: 0.70,
      par: 190, intel: 4,
      brief: 'Embassy is dark and staffed. Pull the drives from both wings, then walk out.',
      intelAt: [2, 3, 6, 4],
      stages: [
        { kind: 'intel', count: 2, icon: 'intel', text: 'Pull two drives',
          spawn: [{ kind: 'rifleman', n: 3, near: 2 }, { kind: 'marksman', n: 1, near: 3 }] },
        { kind: 'clear', count: 6, icon: 'skull', text: 'Clear the atrium',
          spawn: [{ kind: 'rifleman', n: 4, near: 1 }, { kind: 'rusher', n: 2, near: 6 }] },
        { kind: 'extract', anchor: 9, icon: 'extract', text: 'Leave by the south steps' }
      ]
    },
    {
      id: 'op4', no: 4, name: 'Hostage Wing', theatre: 'embassy', difficulty: 0.76,
      par: 205, intel: 3,
      brief: 'Two of ours are held in the west wing. Get to them, walk them out, no losses.',
      intelAt: [6, 8, 5],
      stages: [
        { kind: 'rescue', anchor: 4, count: 2, icon: 'hostage', text: 'Reach the holding room',
          spawn: [{ kind: 'rifleman', n: 4, near: 4 }, { kind: 'heavy', n: 1, near: 1 }] },
        { kind: 'escort', anchor: 9, icon: 'hostage', text: 'Walk them to the steps',
          spawn: [{ kind: 'rusher', n: 3, near: 5 }, { kind: 'rifleman', n: 2, near: 3 }],
          reinforce: { every: 11, n: 2, max: 6 } }
      ]
    },
    {
      id: 'op5', no: 5, name: 'Sandline', theatre: 'desert', difficulty: 0.82,
      par: 220, intel: 3,
      brief: 'Convoy asset is on foot in the compound. Cross the yard with him and hold your lane.',
      intelAt: [5, 2, 8],
      stages: [
        { kind: 'rescue', anchor: 1, count: 1, icon: 'vip', text: 'Reach the asset',
          spawn: [{ kind: 'rifleman', n: 4, near: 2 }, { kind: 'marksman', n: 2, near: 3 }] },
        { kind: 'escort', anchor: 7, icon: 'vip', text: 'Move the asset to the gate',
          spawn: [{ kind: 'rusher', n: 3, near: 4 }, { kind: 'rifleman', n: 3, near: 2 }],
          reinforce: { every: 10, n: 2, max: 8 } }
      ]
    },
    {
      id: 'op6', no: 6, name: 'Hard Deck', theatre: 'desert', difficulty: 0.88,
      par: 235, intel: 4,
      brief: 'Radio room is transmitting. Blow the wall, take the room, hold it while we jam.',
      intelAt: [5, 6, 8, 3],
      stages: [
        { kind: 'breach', anchor: 2, time: 1.8, icon: 'breach', text: 'Set the charge on the wall',
          spawn: [{ kind: 'rifleman', n: 4, near: 4 }, { kind: 'heavy', n: 1, near: 2 }] },
        { kind: 'hold', anchor: 2, time: 42, icon: 'hold', text: 'Hold the radio room',
          spawn: [{ kind: 'rusher', n: 3, near: 4 }, { kind: 'marksman', n: 2, near: 3 }],
          reinforce: { every: 8, n: 2, max: 9 } },
        { kind: 'extract', anchor: 9, icon: 'extract', text: 'Fall back to the west gate' }
      ]
    },
    {
      id: 'op7', no: 7, name: 'Night Cargo', theatre: 'harbour', difficulty: 0.94,
      par: 250, intel: 4,
      brief: 'They learned. Squads with suppression fire on both charges. Work the cover.',
      intelAt: [7, 8, 6, 5],
      stages: [
        { kind: 'defuse', anchor: 4, time: 2.8, icon: 'defuse', text: 'Cut the manifest charge',
          spawn: [{ kind: 'rifleman', n: 4, near: 2 }, { kind: 'marksman', n: 2, near: 6 },
                  { kind: 'heavy', n: 1, near: 4 }] },
        { kind: 'defuse', anchor: 5, time: 2.8, icon: 'defuse', text: 'Cut the crane charge',
          spawn: [{ kind: 'rifleman', n: 3, near: 5 }, { kind: 'rusher', n: 3, near: 3 }],
          reinforce: { every: 12, n: 2, max: 6 } },
        { kind: 'extract', anchor: 9, icon: 'extract', text: 'Exit the dock' }
      ]
    },
    {
      id: 'op8', no: 8, name: 'Under Meridian', theatre: 'subway', difficulty: 0.97,
      par: 265, intel: 4,
      brief: 'Tunnel is theirs. Fighting withdrawal along the platform, one hold at a time.',
      intelAt: [5, 7, 4, 8],
      stages: [
        { kind: 'hold', anchor: 2, time: 26, icon: 'hold', text: 'Hold the east platform',
          spawn: [{ kind: 'rifleman', n: 4, near: 2 }, { kind: 'rusher', n: 3, near: 4 }],
          reinforce: { every: 8, n: 2, max: 8 } },
        { kind: 'hold', anchor: 1, time: 26, icon: 'hold', text: 'Hold the concourse',
          spawn: [{ kind: 'marksman', n: 2, near: 7 }, { kind: 'rifleman', n: 4, near: 5 }],
          reinforce: { every: 8, n: 2, max: 8 } },
        { kind: 'extract', anchor: 9, icon: 'extract', text: 'Break for the west tunnel' }
      ]
    },
    {
      id: 'op9', no: 9, name: 'Last Train', theatre: 'subway', difficulty: 1.0,
      par: 300, intel: 5, finale: true,
      brief: 'Last train is on the board. Hold the platform until it rolls, then be on it.',
      intelAt: [5, 7, 4, 8, 6],
      stages: [
        { kind: 'clear', count: 8, icon: 'skull', text: 'Break the tunnel picket',
          spawn: [{ kind: 'rifleman', n: 4, near: 2 }, { kind: 'heavy', n: 2, near: 6 },
                  { kind: 'rusher', n: 3, near: 4 }] },
        { kind: 'hold', anchor: 1, time: 55, icon: 'hold', text: 'Hold for the train',
          spawn: [{ kind: 'rifleman', n: 4, near: 5 }, { kind: 'marksman', n: 2, near: 7 },
                  { kind: 'rusher', n: 3, near: 8 }],
          reinforce: { every: 7, n: 3, max: 11 } },
        { kind: 'extract', anchor: 9, icon: 'extract', text: 'Board at the west end' }
      ]
    }
  ];

  /* Survival: endless waves in the harbour. Wave n fields a squad built
   * from this table; every fifth wave adds a shield. */
  var SURVIVAL = {
    theatre: 'harbour', start: [17, 10],
    baseCount: 3, perWave: 0.9, maxAlive: 12,
    difficulty: function (wave) { return Math.min(1.25, 0.55 + wave * 0.045); },
    mix: function (wave) {
      var mix = ['rifleman'];
      if (wave >= 2) mix.push('rusher');
      if (wave >= 4) mix.push('marksman');
      if (wave >= 6) mix.push('rifleman');
      if (wave >= 8) mix.push('rusher');
      return mix;
    },
    heavyEvery: 5
  };

  /* Time trial shoot house: pop up targets in the desert compound. */
  var TRIAL = {
    theatre: 'desert', start: [2.5, 10.5], targets: 22, batch: 4, limit: 150,
    order: [5, 1, 2, 4, 3, 6, 8, 7]
  };

  /* ------------------------------------------------------- unlocks */
  var UNLOCKS = [
    { id: 'smoke', type: 'gadget', medals: 2, name: 'Smoke' },
    { id: 'smg', type: 'weapon', medals: 3, name: 'Rasp 9' },
    { id: 'flash', type: 'gadget', medals: 5, name: 'Flashbang' },
    { id: 'dmr', type: 'weapon', medals: 7, name: 'Longshot' },
    { id: 'ping', type: 'gadget', medals: 8, name: 'Drone Ping' },
    { id: 'stub', type: 'weapon', medals: 9, name: 'Stub 20' },
    { id: 'sg', type: 'weapon', medals: 12, name: 'Breacher' }
  ];
  var STARTERS = { ar: true, pistol: true, frag: true };

  function unlockedIds(medals) {
    var out = {};
    for (var k in STARTERS) if (STARTERS.hasOwnProperty(k)) out[k] = true;
    for (var i = 0; i < UNLOCKS.length; i++) if (medals >= UNLOCKS[i].medals) out[UNLOCKS[i].id] = true;
    return out;
  }
  function nextUnlock(medals) {
    for (var i = 0; i < UNLOCKS.length; i++) if (medals < UNLOCKS[i].medals) return UNLOCKS[i];
    return null;
  }

  /* --------------------------------------------- guarded accessors */
  function weapon(id) { return WEAPONS[id] || WEAPONS.ar; }
  function gadget(id) { return GADGETS[id] || GADGETS.frag; }
  function enemy(id) { return ENEMIES[id] || ENEMIES.rifleman; }
  function theatre(id) { return THEATRES[id] || THEATRES.harbour; }
  function mission(index) {
    var i = index | 0;
    if (i < 0) i = 0;
    if (i >= MISSIONS.length) i = MISSIONS.length - 1;
    return MISSIONS[i];
  }
  function missionById(id) {
    for (var i = 0; i < MISSIONS.length; i++) if (MISSIONS[i].id === id) return MISSIONS[i];
    return MISSIONS[0];
  }
  function anchor(th, id) {
    var t = theatre(th);
    var a = t.anchors[id] || t.anchors[1] || [2, 2];
    return { x: a[0] * CELL + CELL * 0.5, y: a[1] * CELL + CELL * 0.5 };
  }

  return {
    CELL: CELL, COLS: COLS, ROWS: ROWS,
    WORLD_W: COLS * CELL, WORLD_H: ROWS * CELL,
    WEAPONS: WEAPONS, PRIMARY_ORDER: PRIMARY_ORDER, SECONDARY_ORDER: SECONDARY_ORDER,
    GADGETS: GADGETS, GADGET_ORDER: GADGET_ORDER,
    ENEMIES: ENEMIES, THEATRES: THEATRES, THEATRE_ORDER: THEATRE_ORDER,
    MISSIONS: MISSIONS, SURVIVAL: SURVIVAL, TRIAL: TRIAL,
    UNLOCKS: UNLOCKS, STARTERS: STARTERS,
    unlockedIds: unlockedIds, nextUnlock: nextUnlock,
    weapon: weapon, gadget: gadget, enemy: enemy, theatre: theatre,
    mission: mission, missionById: missionById, anchor: anchor
  };
})();
