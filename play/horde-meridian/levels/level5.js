(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[5] = {
    id: 5,
    key: 'rift-passage',
    name: 'RIFT PASSAGE',
    tagline: 'CROSS THE VISION POCKETS',
    briefing: [
      'Void static is cutting the lane apart.',
      'Cross the passage before it closes.'
    ],
    region: 'void-rift',
    duration: 360,
    waves: [
      { at: 0,   rate: 1.08, pack: 1, pool: ['drifter', 'blink-stalker'] },
      { at: 24,  rate: 0.92, pack: 1, pool: ['drifter', 'blink-stalker', 'gravity-mite'] },
      { at: 54,  rate: 0.82, pack: 1, pool: ['sprinter', 'blink-stalker', 'gravity-mite'] },
      { at: 90,  rate: 0.74, pack: 2, pool: ['blink-stalker', 'gravity-mite', 'null-leech', 'drifter'] },
      { at: 128, rate: 0.68, pack: 2, pool: ['blink-stalker', 'gravity-mite', 'null-leech', 'bulwark'] },
      { at: 164, rate: 0.58, pack: 2, pool: ['blink-stalker', 'gravity-mite', 'null-leech'] },
      { at: 180, rate: 0.48, pack: 3, pool: ['blink-stalker', 'gravity-mite', 'null-leech'] },
      { at: 220, rate: 0.44, pack: 3, pool: ['blink-stalker', 'gravity-mite', 'null-leech', 'sapper'] },
      { at: 260, rate: 0.39, pack: 3, pool: ['blink-stalker', 'gravity-mite', 'null-leech', 'weaver'] },
      { at: 300, rate: 0.34, pack: 4, pool: ['blink-stalker', 'gravity-mite', 'null-leech', 'lancer'] },
      { at: 338, rate: 0.30, pack: 4, pool: ['blink-stalker', 'gravity-mite', 'null-leech', 'bulwark'] }
    ],
    mods: {
      enemyHp: 1.15,
      enemyDmg: 1.05,
      spawnRate: 1.1
    },
    bases: [
      { at: 112, type: 'bastion', x: -3600, y: -900 },
      { at: 236, type: 'bastion', x: -2720, y: 1160 }
    ],
    finalBoss: {
      type: 'region',
      region: 'void-rift',
      at: 300,
      hpMul: 1.15
    },
    objectives: [
      { id: 'survive', type: 'survive', label: 'SURVIVE THE RIFT' },
      { id: 'bastions', type: 'bases', label: 'BREAK BOTH BASTIONS', count: 2 },
      { id: 'null-proboscis', type: 'boss', label: 'DEFEAT NULL PROBOSCIS', count: 1 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'hull', pct: 40, label: '40% HULL REMAINING' },
      { type: 'level', atLeast: 14, label: 'REACH LEVEL 14' }
    ],
    events: [
      {
        at: 0,
        banner: ['LIGHTNING TEAR', 'VOID STATIC // VISION POCKETS']
      },
      {
        at: 48,
        callout: 'blink signature in the static'
      },
      {
        at: 92,
        banner: ['BLINK SIGNATURE', 'CONTACTS IN THE VISION POCKET'],
        spawnPack: { key: 'blink-stalker', count: 6, elite: true },
        callout: 'blink signatures on your six'
      },
      {
        at: 136,
        banner: ['GRAVITY AMBUSH', 'VECTOR FOLD // HOLD COURSE'],
        spawnPack: { key: 'gravity-mite', count: 8, elite: true },
        callout: 'gravity is folding the lane'
      },
      {
        at: 164,
        grantBonus: 'cloak',
        callout: 'phase cloak drop in the pocket'
      },
      {
        at: 198,
        spawnPack: { key: 'gravity-mite', count: 10, elite: true },
        callout: 'second gravity bloom incoming'
      },
      {
        at: 228,
        grantBonus: 'dilation',
        callout: 'dilation drop at the breach'
      },
      {
        at: 240,
        banner: ['PASSAGE HEAT', 'IT DOES NOT WANT TO BE CROSSED'],
        heat: true,
        callout: 'the passage rejects your crossing'
      },
      {
        at: 276,
        banner: ['NULL STATIC', 'VISION POCKETS CLOSING'],
        spawnPack: { key: 'null-leech', count: 8, elite: true },
        callout: 'null leeches in the dark'
      },
      {
        at: 300,
        banner: ['NULL PROBOSCIS', 'DO NOT LET IT CLOSE THE RIFT'],
        callout: 'null proboscis has found the passage'
      }
    ],
    music: 'base'
  };
}());
