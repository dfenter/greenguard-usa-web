(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[11] = {
    id: 11,
    key: 'graveyard-siege',
    name: 'GRAVEYARD SIEGE',
    tagline: 'FIVE BASES IN THE DEAD FLEET',
    briefing: [
      'The Wardens fortified the capital hulks.',
      'Five bases chained through the wrecks.',
      'The beacon knows the route. Fly it.'
    ],
    region: 'aurelion-graveyard',
    duration: 470,
    waves: [
      { at: 0,   rate: 0.96, pack: 1, pool: ['drifter', 'salvage-swarm'] },
      { at: 30,  rate: 0.82, pack: 2, pool: ['salvage-swarm', 'scrap-ripper', 'sprinter'] },
      { at: 72,  rate: 0.7,  pack: 2, pool: ['scrap-ripper', 'salvage-swarm', 'derelict-guard-hulk'] },
      { at: 120, rate: 0.6,  pack: 3, pool: ['salvage-swarm', 'scrap-ripper', 'grave-egg', 'sapper'] },
      { at: 178, rate: 0.52, pack: 3, pool: ['derelict-guard-hulk', 'scrap-ripper', 'lancer', 'weaver'] },
      { at: 240, rate: 0.45, pack: 4, pool: ['salvage-swarm', 'derelict-guard-hulk', 'grave-egg', 'bulwark', 'sapper'] },
      { at: 305, rate: 0.39, pack: 4, pool: ['scrap-ripper', 'salvage-swarm', 'derelict-guard-hulk', 'lancer', 'weaver'] },
      { at: 370, rate: 0.33, pack: 5, pool: ['derelict-guard-hulk', 'scrap-ripper', 'salvage-swarm', 'grave-egg', 'bulwark', 'sapper'] },
      { at: 430, rate: 0.28, pack: 5, pool: ['salvage-swarm', 'scrap-ripper', 'derelict-guard-hulk', 'lancer', 'weaver', 'sprinter'] }
    ],
    mods: {
      enemyHp: 1.4,
      enemyDmg: 1.2,
      spawnRate: 1.2
    },
    bases: [
      { at: 18,  type: 'bastion', x: -5600, y: -1500 },
      { at: 95,  type: 'hive',    x: -4700, y: 1300 },
      { at: 180, type: 'relay',   x: -5900, y: 400 },
      { at: 265, type: 'bastion', x: -4200, y: -900 },
      { at: 350, type: 'hive',    x: -5000, y: 2000 }
    ],
    regionBosses: [
      { at: 400, region: 'aurelion-graveyard', x: -5200, y: 300, hpMul: 1.25, dmgMul: 1.1 }
    ],
    finalBoss: null,
    objectives: [
      { id: 'siege', type: 'bases', label: 'BREAK FIVE SIEGE BASES', count: 5 },
      { id: 'queen', type: 'boss', label: 'KILL THE CARRION QUEEN', count: 1 },
      { id: 'cull', type: 'kills', label: 'CULL 350 HOSTILES', count: 350 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'noWingLost', label: 'NO WINGMAN LOST' },
      { type: 'time', under: 450, label: 'WIN BEFORE 7:30' }
    ],
    events: [
      { at: 10, banner: ['DEAD FLEET', 'SIEGE LINE ON THE BEACON'], callout: 'the beacon leads base to base // fly the route' },
      { at: 50, gems: { count: 5, value: 2 } },
      { at: 100, banner: ['HULK WAKE', 'GUARD HULKS SHIFTING'], spawnPack: { key: 'derelict-guard-hulk', count: 3, elite: true } },
      { at: 148, grantBonus: 'wing', callout: 'wingman on station // it flies your weapon' },
      { at: 186, banner: ['RELAY SIGNAL', 'JAMMER FORTRESS IN THE WRECKS'] },
      { at: 232, gems: { count: 6, value: 2 } },
      { at: 270, grantBonus: 'tempest', callout: 'arc tempest online // the storm fights with you' },
      { at: 312, banner: ['EGG CLUSTERS', 'HATCHERIES SEEDED IN THE HULLS'], spawnPack: { key: 'grave-egg', count: 4 } },
      { at: 356, banner: ['LAST BASE', 'THE DEEP HIVE WAKES'], heat: true },
      { at: 398, banner: ['CARRION QUEEN', 'SHE COMES FOR HER EGGS'] },
      { at: 430, gems: { count: 8, value: 2 } }
    ]
  };
}());
