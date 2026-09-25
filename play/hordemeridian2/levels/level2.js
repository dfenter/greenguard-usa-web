(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[2] = {
    id: 2,
    key: 'grave-shift',
    name: 'GRAVE SHIFT',
    tagline: 'THE HULKS ARE NOT EMPTY',
    briefing: [
      'SECOND PASS ON THE GRAVEYARD.',
      'THE WRECKS ARE WAKING UP.',
      'CLEAR THEM OR DIE TRYING.'
    ],
    region: 'aurelion-graveyard',
    duration: 185,
    waves: [
      { at: 0, rate: 0.62, pack: 2, pool: ['drifter', 'sprinter', 'salvage-swarm'] },
      { at: 16, rate: 0.56, pack: 2, pool: ['sprinter', 'salvage-swarm', 'scrap-ripper'] },
      { at: 34, rate: 0.52, pack: 3, pool: ['sprinter', 'salvage-swarm', 'scrap-ripper', 'bulwark'] },
      { at: 58, rate: 0.48, pack: 3, pool: ['scrap-ripper', 'derelict-guard-hulk', 'salvage-swarm'] },
      { at: 84, rate: 0.44, pack: 3, pool: ['scrap-ripper', 'derelict-guard-hulk', 'grave-egg'] },
      { at: 112, rate: 0.4, pack: 3, pool: ['scrap-ripper', 'derelict-guard-hulk', 'grave-egg', 'salvage-swarm'] },
      { at: 142, rate: 0.36, pack: 3, pool: ['scrap-ripper', 'derelict-guard-hulk', 'grave-egg'] },
      { at: 166, rate: 0.34, pack: 4, pool: ['scrap-ripper', 'derelict-guard-hulk', 'grave-egg', 'salvage-swarm'] }
    ],
    mods: {
      spawnRate: 0.75,
      enemyHp: 0.9,
      enemyDmg: 0.9
    },
    bases: [],
    regionBosses: [],
    finalBoss: null,
    objectives: [
      { id: 'survive-shift', type: 'survive', label: 'RIDE OUT THE SHIFT' },
      { id: 'kills-hulks', type: 'kills', label: 'CLEAR 110 HOSTILES', count: 110 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'time', under: 175, label: 'CLEAR UNDER 175 SECONDS' },
      { type: 'kills', atLeast: 130, label: '130 HOSTILES CLEARED' }
    ],
    events: [
      {
        at: 0,
        banner: ['GRAVE SHIFT', 'WRECKS POWERING UP'],
        callout: 'hulk plating reads hot // stay wide'
      },
      {
        at: 20,
        banner: ['HULL BREACH', 'SWARM POURS OUT'],
        spawnPack: { key: 'salvage-swarm', count: 5 }
      },
      {
        at: 50,
        banner: ['GUARD HULK', 'DERELICT SENTRY ONLINE'],
        spawnPack: { key: 'derelict-guard-hulk', count: 2, elite: true }
      },
      {
        at: 72,
        banner: ['GEM CACHE', 'SALVAGE PAYOUT'],
        gems: { count: 8, value: 1 }
      },
      {
        at: 96,
        banner: ['EGG CLUSTER', 'STOP THE HATCH'],
        spawnPack: { key: 'grave-egg', count: 3 }
      },
      {
        at: 124,
        banner: ['ARSENAL DROP', 'WEAPON CACHE FOUND'],
        grantBonus: 'arsenal'
      },
      {
        at: 150,
        banner: ['DEEP SHIFT', 'PRESSURE CLIMBING'],
        spawnPack: { key: 'scrap-ripper', count: 6, elite: true },
        heat: true
      },
      {
        at: 172,
        banner: ['LAST WRECK', 'HOLD THE SHIFT'],
        callout: 'final wreck // finish the shift'
      }
    ],
    music: 'base'
  };
}());
