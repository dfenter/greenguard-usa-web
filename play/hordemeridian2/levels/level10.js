(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[10] = {
    id: 10,
    key: 'null-harvest',
    name: 'NULL HARVEST',
    tagline: 'THE RIFT EATS ITS OWN',
    briefing: [
      'THE RIFT IS DEVOURING ITS OWN DEBRIS.',
      'ENDURE THE FULL HARVEST CYCLE.',
      'APEX SIGNATURES CONFIRMED LATE RUN.'
    ],
    region: 'void-rift',
    duration: 330,
    waves: [
      { at: 0,   rate: 0.74, pack: 2, pool: ['blink-stalker', 'gravity-mite'] },
      { at: 22,  rate: 0.66, pack: 2, pool: ['blink-stalker', 'gravity-mite', 'null-leech'] },
      { at: 50,  rate: 0.60, pack: 2, pool: ['blink-stalker', 'gravity-mite', 'null-leech', 'sprinter'] },
      { at: 84,  rate: 0.54, pack: 3, pool: ['gravity-mite', 'null-leech', 'lancer'] },
      { at: 118, rate: 0.48, pack: 3, pool: ['gravity-mite', 'null-leech', 'lancer', 'weaver', 'wing-cutter'] },
      { at: 138, rate: 0.44, pack: 3, pool: ['null-leech', 'lancer', 'weaver', 'dread-lancer'] },
      { at: 154, rate: 0.42, pack: 3, pool: ['null-leech', 'lancer', 'weaver', 'sapper'] },
      { at: 190, rate: 0.37, pack: 4, pool: ['null-leech', 'lancer', 'sapper', 'bulwark', 'rift-strafer', 'nebula-burrower'] },
      { at: 230, rate: 0.32, pack: 4, pool: ['null-leech', 'lancer', 'sapper', 'dread-lancer', 'warden-titan'] },
      { at: 270, rate: 0.28, pack: 4, pool: ['null-leech', 'sapper', 'dread-lancer', 'warden-titan'] },
      { at: 305, rate: 0.24, pack: 5, pool: ['null-leech', 'dread-lancer', 'warden-titan'] }
    ],
    mods: {
      enemyHp: 1.35,
      enemyDmg: 1.25,
      spawnRate: 1.3
    },
    bases: [],
    regionBosses: [],
    finalBoss: null,
    objectives: [
      { id: 'endure-harvest', type: 'survive', label: 'ENDURE THE HARVEST' },
      { id: 'harvest-kills', type: 'kills', label: 'BREAK 360 HOSTILES', count: 360 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'time', under: 320, label: 'CLEAR BEFORE 5:20' },
      { type: 'level', atLeast: 18, label: 'REACH LEVEL 18' }
    ],
    events: [
      { at: 0, banner: ['NULL HARVEST', 'CYCLE BEGINS'] },
      { at: 32, spawnPack: { key: 'null-leech', count: 7 } },
      { at: 68, banner: ['HARVEST SPIKE', 'DEBRIS CONSUMED'], spawnPack: { key: 'gravity-mite', count: 7, elite: true } },
      { at: 105, grantBonus: 'overdrive' },
      { at: 140, banner: ['APEX SIGNATURE', 'DREAD LANCER CONFIRMED'], spawnPack: { key: 'dread-lancer', count: 2, elite: true } },
      { at: 175, gems: { count: 8, value: 2 } },
      { at: 210, banner: ['TITAN BLOOM', 'WARDEN TITAN CONFIRMED'], spawnPack: { key: 'warden-titan', count: 2, elite: true } },
      { at: 250, grantBonus: 'reflector' },
      { at: 290, banner: ['FINAL CYCLE', 'HOLD THE LINE'], spawnPack: { key: 'warden-titan', count: 3, elite: true }, heat: true }
    ],
    music: 'heat'
  };
}());
