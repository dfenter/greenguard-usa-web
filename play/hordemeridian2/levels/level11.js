(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[11] = {
    id: 11,
    key: 'two-lords',
    name: 'TWO LORDS',
    tagline: 'HUNT THEM BOTH',
    briefing: [
      'TWO SWARM LORDS SHARE THE TEAR.',
      'NEITHER WILL YIELD GROUND.',
      'DROP BOTH OR DROP HERE.'
    ],
    region: 'void-rift',
    duration: 310,
    waves: [
      { at: 0,   rate: 0.9,  pack: 2, pool: ['drifter', 'sprinter', 'blink-stalker'] },
      { at: 24,  rate: 0.78, pack: 2, pool: ['blink-stalker', 'gravity-mite', 'sprinter'] },
      { at: 55,  rate: 0.68, pack: 2, pool: ['blink-stalker', 'null-leech', 'gravity-mite', 'lancer'] },
      { at: 92,  rate: 0.6,  pack: 3, pool: ['null-leech', 'blink-stalker', 'weaver', 'sapper'] },
      { at: 134, rate: 0.52, pack: 3, pool: ['null-leech', 'gravity-mite', 'blink-stalker', 'bulwark'] },
      { at: 180, rate: 0.46, pack: 3, pool: ['null-leech', 'blink-stalker', 'weaver', 'sapper', 'lancer'] },
      { at: 228, rate: 0.4,  pack: 4, pool: ['null-leech', 'gravity-mite', 'blink-stalker', 'bulwark', 'weaver'] },
      { at: 270, rate: 0.36, pack: 4, pool: ['null-leech', 'blink-stalker', 'weaver', 'sapper', 'lancer', 'bulwark'] }
    ],
    mods: {
      spawnRate: 1.5,
      enemyHp: 1.55,
      enemyDmg: 1.3
    },
    bases: [],
    regionBosses: [
      { at: 80,  region: 'void-rift',       x: -3020, y: 1420,  hpMul: 0.9 },
      { at: 210, region: 'crystal-shoals',  x: 5060,  y: -1640, hpMul: 1.05 }
    ],
    finalBoss: null,
    objectives: [
      { id: 'crowns', type: 'boss', label: 'KILL BOTH SWARM LORDS', count: 2 },
      { id: 'survive', type: 'survive', label: 'HOLD THE TEAR' }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'kills', atLeast: 160, label: '160 HOSTILES CLEARED' },
      { type: 'time', under: 280, label: 'WIN BEFORE 4:40' }
    ],
    events: [
      {
        at: 0,
        banner: ['TWO SIGNALS', 'BOTH LORDS ACTIVE']
      },
      {
        at: 30,
        banner: ['RIFT FLEX', 'SPACE BENDS HERE'],
        spawnPack: { key: 'blink-stalker', count: 5 }
      },
      {
        at: 80,
        banner: ['FIRST LORD', 'NULL PROBOSCIS RISES']
      },
      {
        at: 100,
        banner: ['GEM POCKET', 'RIFT DEBRIS'],
        gems: { count: 8, value: 2 }
      },
      {
        at: 140,
        banner: ['REINFORCE', 'MORE SIGNALS INBOUND'],
        spawnPack: { key: 'null-leech', count: 6 }
      },
      {
        at: 175,
        banner: ['RIFT CACHE', 'ARM YOURSELF'],
        grantBonus: 'arsenal'
      },
      {
        at: 210,
        banner: ['SECOND LORD', 'SHOALS TYRANT ARRIVES'],
        heat: true
      },
      {
        at: 250,
        banner: ['BOTH ACTIVE', 'FINISH THEM']
      }
    ],
    music: 'heat'
  };
}());
