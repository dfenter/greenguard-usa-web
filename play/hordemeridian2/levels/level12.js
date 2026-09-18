(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[12] = {
    id: 12,
    key: 'iron-vigil',
    name: 'IRON VIGIL',
    tagline: 'HOLD WHILE THE FLEET RUNS',
    briefing: [
      'THE LAST TRANSPORTS ARE LOADING.',
      'HOLD THE GRAVEYARD CHOKE.',
      'BREAK THE BASTIONS. DROP THE QUEEN.'
    ],
    region: 'aurelion-graveyard',
    duration: 380,
    waves: [
      { at: 0,   rate: 0.86, pack: 2, pool: ['drifter', 'sprinter', 'salvage-swarm'] },
      { at: 26,  rate: 0.74, pack: 2, pool: ['salvage-swarm', 'scrap-ripper', 'sprinter'] },
      { at: 60,  rate: 0.64, pack: 2, pool: ['scrap-ripper', 'salvage-swarm', 'derelict-guard-hulk'] },
      { at: 98,  rate: 0.56, pack: 3, pool: ['scrap-ripper', 'grave-egg', 'salvage-swarm', 'sapper'] },
      { at: 140, rate: 0.5,  pack: 3, pool: ['derelict-guard-hulk', 'scrap-ripper', 'grave-egg', 'lancer'] },
      { at: 186, rate: 0.44, pack: 3, pool: ['salvage-swarm', 'scrap-ripper', 'grave-egg', 'weaver', 'bulwark'] },
      { at: 236, rate: 0.4,  pack: 4, pool: ['derelict-guard-hulk', 'grave-egg', 'scrap-ripper', 'sapper', 'lancer'] },
      { at: 290, rate: 0.36, pack: 4, pool: ['salvage-swarm', 'scrap-ripper', 'grave-egg', 'derelict-guard-hulk', 'weaver'] },
      { at: 340, rate: 0.32, pack: 4, pool: ['derelict-guard-hulk', 'grave-egg', 'scrap-ripper', 'sapper', 'lancer', 'bulwark'] }
    ],
    mods: {
      spawnRate: 1.55,
      enemyHp: 1.6,
      enemyDmg: 1.3
    },
    bases: [
      { at: 70,  type: 'bastion', x: -5260, y: 1160 },
      { at: 220, type: 'bastion', x: 3040,  y: -1080 }
    ],
    regionBosses: [
      { at: 300, region: 'aurelion-graveyard', x: -5260, y: 1160, hpMul: 1.1 }
    ],
    finalBoss: null,
    objectives: [
      { id: 'bastions', type: 'bases', label: 'SILENCE THE TWIN GUNS', count: 2 },
      { id: 'queen', type: 'boss', label: 'END THE BROOD MOTHER', count: 1 },
      { id: 'survive', type: 'survive', label: 'HOLD THE CHOKE' }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'level', atLeast: 23, label: 'VIGIL RANK 23' },
      { type: 'hull', pct: 35, label: '35 PERCENT HULL REMAINING' }
    ],
    events: [
      {
        at: 0,
        banner: ['FLEET LOADS', 'HOLD THE LINE']
      },
      {
        at: 35,
        banner: ['HULK STIRS', 'CONTACTS RISING'],
        spawnPack: { key: 'salvage-swarm', count: 5 }
      },
      {
        at: 70,
        banner: ['FIRST BASTION', 'GUNS ONLINE']
      },
      {
        at: 110,
        banner: ['GEM VEIN', 'CRACKED PLATING'],
        gems: { count: 9, value: 2 }
      },
      {
        at: 160,
        banner: ['AEGIS CACHE', 'PLATING FOUND'],
        grantBonus: 'aegis'
      },
      {
        at: 220,
        banner: ['SECOND BASTION', 'BATTERIES HOT']
      },
      {
        at: 260,
        banner: ['HULK SWARM', 'MASS CONTACT'],
        spawnPack: { key: 'derelict-guard-hulk', count: 4, elite: true }
      },
      {
        at: 300,
        banner: ['QUEEN WAKES', 'CARRION QUEEN RISES'],
        heat: true
      }
    ],
    music: 'heat'
  };
}());
