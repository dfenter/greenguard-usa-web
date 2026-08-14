/* sf_data.js -- Slingfang content tables.
 *
 * Everything authored (roster, enemy families, the twelve campaign
 * formations across four world sets, the six hand-authored Formation Rush
 * legs, medal pars and the unlock chain) lives here so game.js stays
 * mechanics-only.
 *
 * Authoring space is the design-space arena rectangle:
 *   x 12 .. 378, y 70 .. 636.
 * Enemies are authored in y 104 .. 500; the band below that belongs to the
 * launch row and the player's thumbs.
 *
 * EVERY lookup into these tables from game.js goes through SFData.enemy(),
 * SFData.creature() or SFData.formation(), which all return a guarded
 * fallback. A raw TABLE[key] miss hard-froze a shipped fleet title.
 */
(function (root) {
  'use strict';

  var ARENA = { left: 12, right: 378, top: 70, bottom: 636 };

  // --------------------------------------------------------------- roster
  // passive = always-on while this creature is the launched one.
  // aura    = fired when the launched creature bumps this one's post.
  var ROSTER = [
    {
      id: 'flint', name: 'Flintling', tag: 'FLINT', color: 0xffbf69,
      passive: 'pierce', aura: 'grit',
      passiveText: 'Punches through: double damage, never ricochets off a foe',
      auraText: 'Grit: the next impact lands double',
      unlockAt: 0
    },
    {
      id: 'split', name: 'Splitmaw', tag: 'SPLIT', color: 0xff83b5,
      passive: 'split', aura: 'rend',
      passiveText: 'First impact throws two splinters',
      auraText: 'Rend: throws four splinters from the bump',
      unlockAt: 0
    },
    {
      id: 'pull', name: 'Pullpup', tag: 'PULL', color: 0x84c9ff,
      passive: 'magnet', aura: 'tug',
      passiveText: 'Drags nearby foes into the line of travel',
      auraText: 'Tug: hauls every nearby foe toward the bump',
      unlockAt: 0
    },
    {
      id: 'mend', name: 'Mossmender', tag: 'MEND', color: 0x9eeda7,
      passive: 'mend', aura: 'heal',
      passiveText: 'Every kill returns a little vitality',
      auraText: 'Heal: restores 22 vitality',
      unlockAt: 3
    },
    {
      id: 'spark', name: 'Sparkjaw', tag: 'SPARK', color: 0xffe27b,
      passive: 'spark', aura: 'shock',
      passiveText: 'Each wall bank zaps the nearest foe',
      auraText: 'Shock: 2 damage to everything nearby',
      unlockAt: 6
    },
    {
      id: 'ward', name: 'Wardwisp', tag: 'WARD', color: 0xc5a6ff,
      passive: 'ward', aura: 'shield',
      passiveText: 'Recoil costs 60 percent less vitality',
      auraText: 'Shield: damage dampened for 6 seconds',
      unlockAt: 9
    }
  ];

  var ROSTER_BY_ID = {};
  for (var ri = 0; ri < ROSTER.length; ri++) {
    ROSTER[ri].index = ri;
    ROSTER_BY_ID[ROSTER[ri].id] = ROSTER[ri];
  }

  // -------------------------------------------------------- enemy families
  var ENEMIES = {
    mote:   { key: 'mote',   frame: 'en_mote',   r: 17, hp: 1,  score: 80,  drift: 8,  color: 0xee7e70 },
    brute:  { key: 'brute',  frame: 'en_brute',  r: 23, hp: 3,  score: 150, drift: 4,  color: 0xe89d65 },
    warden: { key: 'warden', frame: 'en_warden', r: 20, hp: 2,  score: 130, drift: 6,  color: 0xd477b3, needsBank: true },
    brood:  { key: 'brood',  frame: 'en_brood',  r: 34, hp: 14, score: 900, drift: 3,  color: 0xf05e6f, needsBank: true }
  };

  // ------------------------------------------------------------ world sets
  // Each set owns its own bank geometry, palette accent and difficulty step.
  var SETS = {
    open: {
      id: 'open', name: 'Open Field', accent: 0x6fe3c8,
      brief: 'Open ground. Learn the pull and first bank.'
    },
    canyon: {
      id: 'canyon', name: 'Bank-Shot Canyon', accent: 0x7ac8ff,
      brief: 'Barriers only break on a banked shot.'
    },
    yard: {
      id: 'yard', name: 'Ally Cluster Yard', accent: 0x9eeda7,
      brief: 'Field posts. Bump allies to chain auras.'
    },
    master: {
      id: 'master', name: 'Slingfang Master', accent: 0xffbf69,
      brief: 'Everything at once.'
    }
  };

  function e(type, x, y) { return { t: type, x: x, y: y }; }
  function b(x, y, w, h, hp) { return { x: x, y: y, w: w, h: h, hp: hp || 1 }; }

  // --------------------------------------------------------- 12 formations
  var FORMATIONS = [
    {
      id: 'f1', set: 'open', name: 'First Light', par: 3, comboTarget: 3,
      enemies: [e('mote', 120, 248), e('mote', 165, 197), e('mote', 213, 188),
                e('mote', 262, 226), e('mote', 195, 314)],
      barriers: [b(195, 286, 136, 18, 1)], posts: []
    },
    {
      id: 'f2', set: 'open', name: 'Wide Rank', par: 4, comboTarget: 4,
      enemies: [e('mote', 70, 216), e('mote', 120, 216), e('mote', 170, 216),
                e('mote', 220, 216), e('mote', 270, 216), e('mote', 320, 216),
                e('mote', 145, 327), e('mote', 245, 327)],
      barriers: [], posts: []
    },
    {
      id: 'f3', set: 'open', name: 'Iron Row', par: 5, comboTarget: 4,
      enemies: [e('brute', 110, 226), e('brute', 280, 226),
                e('mote', 175, 182), e('mote', 215, 182),
                e('mote', 150, 321), e('mote', 195, 346), e('mote', 240, 321),
                e('mote', 60, 343), e('mote', 330, 343)],
      barriers: [], posts: []
    },
    {
      id: 'f4', set: 'canyon', name: 'Narrow Pass', par: 5, comboTarget: 4,
      enemies: [e('mote', 195, 185), e('mote', 150, 248), e('mote', 240, 248),
                e('mote', 195, 305), e('warden', 195, 118), e('mote', 110, 358),
                e('mote', 280, 358)],
      barriers: [b(96, 286, 24, 225), b(294, 286, 24, 225)], posts: []
    },
    {
      id: 'f5', set: 'canyon', name: 'Double Bank', par: 6, comboTarget: 5,
      enemies: [e('warden', 120, 185), e('warden', 270, 185),
                e('mote', 195, 140), e('mote', 160, 257), e('mote', 230, 257),
                e('brute', 195, 371)],
      barriers: [b(150, 229, 130, 20, 1), b(90, 422, 108, 20, 1), b(292, 422, 108, 20, 1)],
      posts: []
    },
    {
      id: 'f6', set: 'canyon', name: 'Canyon Gate', par: 7, comboTarget: 5,
      enemies: [e('warden', 100, 156), e('warden', 195, 131), e('warden', 290, 156),
                e('brute', 140, 314), e('brute', 250, 314),
                e('mote', 195, 264), e('mote', 70, 415), e('mote', 320, 415)],
      barriers: [b(195, 213, 210, 20, 2), b(80, 371, 22, 180, 1), b(310, 371, 22, 180, 1)],
      posts: []
    },
    {
      id: 'f7', set: 'yard', name: 'Sparring Yard', par: 6, comboTarget: 6,
      enemies: [e('mote', 90, 185), e('mote', 140, 153), e('mote', 195, 140),
                e('mote', 250, 153), e('mote', 300, 185), e('mote', 120, 343),
                e('mote', 195, 371), e('mote', 270, 343), e('brute', 195, 248)],
      barriers: [],
      posts: [{ x: 80, y: 438 }, { x: 195, y: 460 }, { x: 310, y: 438 }]
    },
    {
      id: 'f8', set: 'yard', name: 'Cluster Drill', par: 7, comboTarget: 7,
      enemies: [e('brute', 110, 200), e('brute', 280, 200), e('brute', 195, 134),
                e('mote', 150, 286), e('mote', 240, 286), e('mote', 195, 343),
                e('mote', 70, 343), e('mote', 320, 343), e('warden', 195, 232)],
      barriers: [],
      posts: [{ x: 70, y: 424 }, { x: 165, y: 449 }, { x: 240, y: 449 }, { x: 320, y: 424 }]
    },
    {
      id: 'f9', set: 'yard', name: 'Yard Siege', par: 8, comboTarget: 8,
      enemies: [e('warden', 110, 156), e('warden', 280, 156),
                e('brute', 195, 144), e('brute', 90, 305), e('brute', 300, 305),
                e('mote', 150, 226), e('mote', 240, 226), e('mote', 195, 286),
                e('mote', 120, 403), e('mote', 270, 403)],
      barriers: [b(195, 200, 150, 18, 1), b(195, 362, 150, 18, 1)],
      posts: [{ x: 66, y: 444 }, { x: 160, y: 469 }, { x: 236, y: 469 }, { x: 326, y: 444 }]
    },
    {
      id: 'f10', set: 'master', name: "Master's Approach", par: 8, comboTarget: 8,
      enemies: [e('warden', 130, 150), e('warden', 260, 150),
                e('brute', 195, 131), e('brute', 88, 279), e('brute', 302, 279),
                e('mote', 160, 235), e('mote', 230, 235), e('mote', 195, 302),
                e('mote', 110, 403), e('mote', 280, 403), e('mote', 195, 422)],
      barriers: [b(90, 204, 22, 162, 1), b(300, 204, 22, 162, 1)],
      posts: [{ x: 84, y: 451 }, { x: 195, y: 474 }, { x: 306, y: 451 }]
    },
    {
      id: 'f11', set: 'master', name: 'Fang Gauntlet', par: 9, comboTarget: 8,
      enemies: [e('warden', 90, 140), e('warden', 195, 118), e('warden', 300, 140),
                e('warden', 140, 276), e('warden', 250, 276),
                e('brute', 195, 362), e('brute', 70, 403), e('brute', 320, 403),
                e('mote', 150, 194), e('mote', 240, 194)],
      barriers: [b(195, 188, 190, 18, 2), b(120, 327, 20, 156, 1),
                 b(270, 327, 20, 156, 1), b(195, 469, 150, 18, 1)],
      posts: [{ x: 76, y: 470 }, { x: 314, y: 470 }]
    },
    {
      id: 'f12', set: 'master', name: 'Slingfang Master', par: 10, comboTarget: 10,
      brood: true,
      enemies: [e('brood', 195, 213),
                e('warden', 82, 182), e('warden', 308, 182),
                e('warden', 120, 362), e('warden', 270, 362),
                e('brute', 195, 422), e('mote', 60, 450), e('mote', 330, 450)],
      barriers: [b(100, 289, 20, 174, 2), b(290, 289, 20, 174, 2),
                 b(195, 112, 176, 18, 2), b(195, 510, 176, 18, 1)],
      posts: [{ x: 78, y: 480 }, { x: 195, y: 497 }, { x: 312, y: 480 }]
    }
  ];

  var BY_ID = {};
  for (var fi = 0; fi < FORMATIONS.length; fi++) {
    FORMATIONS[fi].index = fi;
    BY_ID[FORMATIONS[fi].id] = FORMATIONS[fi];
  }

  // ------------------------------------------------- Formation Rush legs
  // Six hand-authored back-to-back formations. Deliberately NOT a reshuffle
  // of the campaign: the Rush escalates faster and leans on bank geometry
  // from the first leg, because the player arrives already trained.
  var RUSH = [
    {
      id: 'r1', set: 'open', name: 'Rush: Break', par: 3, comboTarget: 4,
      enemies: [e('mote', 110, 200), e('mote', 160, 169), e('mote', 230, 169),
                e('mote', 280, 200), e('mote', 195, 273), e('brute', 195, 134)],
      barriers: [], posts: []
    },
    {
      id: 'r2', set: 'canyon', name: 'Rush: Chute', par: 4, comboTarget: 5,
      enemies: [e('warden', 195, 140), e('mote', 140, 232), e('mote', 250, 232),
                e('mote', 195, 295), e('brute', 92, 343), e('brute', 298, 343)],
      barriers: [b(120, 213, 20, 180, 1), b(270, 213, 20, 180, 1)], posts: []
    },
    {
      id: 'r3', set: 'yard', name: 'Rush: Yard', par: 5, comboTarget: 7,
      enemies: [e('mote', 90, 182), e('mote', 150, 150), e('mote', 240, 150),
                e('mote', 300, 182), e('brute', 195, 226), e('brute', 120, 333),
                e('brute', 270, 333)],
      barriers: [],
      posts: [{ x: 88, y: 435 }, { x: 195, y: 456 }, { x: 302, y: 435 }]
    },
    {
      id: 'r4', set: 'canyon', name: 'Rush: Vault', par: 6, comboTarget: 7,
      enemies: [e('warden', 110, 147), e('warden', 280, 147), e('warden', 195, 279),
                e('brute', 150, 403), e('brute', 240, 403), e('mote', 195, 185),
                e('mote', 70, 362), e('mote', 320, 362)],
      barriers: [b(195, 213, 200, 18, 2), b(195, 343, 120, 18, 1)],
      posts: [{ x: 195, y: 446 }]
    },
    {
      id: 'r5', set: 'master', name: 'Rush: Gauntlet', par: 7, comboTarget: 9,
      enemies: [e('warden', 88, 153), e('warden', 195, 125), e('warden', 302, 153),
                e('brute', 140, 286), e('brute', 250, 286), e('brute', 195, 387),
                e('mote', 66, 415), e('mote', 324, 415), e('mote', 195, 219)],
      barriers: [b(114, 223, 20, 150, 1), b(276, 223, 20, 150, 1),
                 b(195, 479, 170, 18, 1)],
      posts: [{ x: 80, y: 472 }, { x: 310, y: 472 }]
    },
    {
      id: 'r6', set: 'master', name: 'Rush: The Master', par: 9, comboTarget: 11,
      brood: true,
      enemies: [e('brood', 195, 226), e('warden', 84, 175), e('warden', 306, 175),
                e('warden', 132, 381), e('warden', 258, 381),
                e('brute', 195, 453), e('mote', 62, 422), e('mote', 328, 422)],
      barriers: [b(104, 302, 20, 168, 2), b(286, 302, 20, 168, 2),
                 b(195, 118, 168, 18, 2)],
      posts: [{ x: 84, y: 483 }, { x: 195, y: 500 }, { x: 306, y: 483 }]
    }
  ];
  for (var rj = 0; rj < RUSH.length; rj++) {
    RUSH[rj].index = rj;
    RUSH[rj].rush = true;
    BY_ID[RUSH[rj].id] = RUSH[rj];
  }

  // --------------------------------------------------------------- tuning
  var TUNE = {
    // Generous by directive: the drop between formations is meant to feel
    // like a gift, not a rationing decision.
    dropVitality: 34,
    dropFreeShots: 3,
    rushDropVitality: 40,
    rushDropFreeShots: 4,
    startVitality: 100,
    maxVitality: 100,
    recoilBase: 4,
    recoilBrute: 7,
    endShotDrainMin: 3,
    endShotDrainMax: 8,
    minPower: 0.22,
    maxPull: 132,
    launchSpeed: 780,
    friction: 0.38,      // velocity retained per second
    settleSpeed: 34,
    settleTime: 0.42,
    shotTimeout: 9
  };

  // A completely blank fallback formation. If a lookup ever misses, the game
  // still gets a playable, clearable object instead of undefined.
  var FALLBACK_FORMATION = {
    id: 'fallback', set: 'open', name: 'Open Ground', par: 3, comboTarget: 3,
    enemies: [e('mote', 150, 232), e('mote', 240, 232), e('mote', 195, 302)],
    barriers: [], posts: [], index: 0
  };

  root.SFData = {
    ARENA: ARENA,
    ROSTER: ROSTER,
    ENEMIES: ENEMIES,
    SETS: SETS,
    FORMATIONS: FORMATIONS,
    RUSH: RUSH,
    TUNE: TUNE,

    // ---- guarded accessors. Never index the tables directly from game.js.
    creature: function (idOrIndex) {
      if (typeof idOrIndex === 'number') {
        return ROSTER[idOrIndex] || ROSTER[0];
      }
      return ROSTER_BY_ID[idOrIndex] || ROSTER[0];
    },
    enemy: function (type) {
      return ENEMIES[type] || ENEMIES.mote;
    },
    set: function (id) {
      return SETS[id] || SETS.open;
    },
    formation: function (index) {
      var f = FORMATIONS[index];
      return f || FALLBACK_FORMATION;
    },
    rushLeg: function (index) {
      var f = RUSH[index];
      return f || FALLBACK_FORMATION;
    },
    byId: function (id) {
      return BY_ID[id] || FALLBACK_FORMATION;
    },
    // Unlock chain: how many campaign formations must be cleared.
    unlockedCount: function (maxCleared) {
      var n = 0;
      for (var i = 0; i < ROSTER.length; i++) {
        if ((maxCleared | 0) >= ROSTER[i].unlockAt) n++;
      }
      return Math.max(3, Math.min(ROSTER.length, n));
    },
    // 3 conditions -> gold / 2 -> silver / cleared -> bronze.
    medalFor: function (formation, shotsUsed, bestCombo, vitalityLost) {
      var f = formation || FALLBACK_FORMATION;
      var met = 0;
      if (shotsUsed <= f.par) met++;
      if (bestCombo >= f.comboTarget) met++;
      if (!vitalityLost) met++;
      return met >= 3 ? 'gold' : met >= 2 ? 'silver' : 'bronze';
    },
    MEDAL_VALUE: { bronze: 1, silver: 2, gold: 3 }
  };
})(typeof window !== 'undefined' ? window : globalThis);
