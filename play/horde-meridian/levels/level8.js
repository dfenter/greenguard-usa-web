(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[8] = {
    id: 8,
    key: 'swarmfall',
    name: 'SWARMFALL',
    tagline: 'FIVE LORDS. ONE CALL.',
    briefing: [
      'Five Swarm Lords answer one call.',
      'Fight through five regional warbands.',
      'Leave no lord alive at 08:00.'
    ],
    region: 'void-rift',
    duration: 480,
    waves: [
      { at: 0,   rate: 1.20, pack: 1, pool: ['drifter', 'gravity-mite', 'shard-larva', 'salvage-swarm'] },
      { at: 28,  rate: 1.00, pack: 1, pool: ['drifter', 'sprinter', 'blink-stalker', 'cinder-kamikaze', 'glasswing-drone'] },
      { at: 52,  rate: 1.08, pack: 1, pool: ['gravity-mite', 'ash-wraith', 'shard-larva', 'scrap-ripper', 'blink-stalker'] },
      { at: 76,  rate: 0.86, pack: 2, pool: ['sprinter', 'null-leech', 'ember-scarab', 'refracting-shard-drone', 'salvage-swarm'] },
      { at: 137, rate: 1.00, pack: 2, pool: ['drifter', 'blink-stalker', 'glasswing-drone', 'scrap-ripper', 'cinder-kamikaze'] },
      { at: 160, rate: 0.82, pack: 2, pool: ['bulwark', 'ember-scarab', 'refracting-shard-drone', 'null-leech', 'derelict-guard-hulk'] },
      { at: 205, rate: 0.94, pack: 2, pool: ['sapper', 'ash-wraith', 'shard-larva', 'gravity-mite', 'salvage-swarm'] },
      { at: 222, rate: 1.02, pack: 2, pool: ['blink-stalker', 'null-leech', 'glasswing-drone', 'scrap-ripper', 'grave-egg'] },
      { at: 242, rate: 0.78, pack: 3, pool: ['sprinter', 'ember-scarab', 'refracting-shard-drone', 'derelict-guard-hulk', 'cinder-kamikaze'] },
      { at: 292, rate: 0.92, pack: 3, pool: ['lancer', 'null-leech', 'ash-wraith', 'glasswing-drone', 'scrap-ripper'] },
      { at: 313, rate: 1.00, pack: 3, pool: ['gravity-mite', 'shard-larva', 'salvage-swarm', 'grave-egg', 'blink-stalker'] },
      { at: 340, rate: 0.74, pack: 3, pool: ['bulwark', 'sapper', 'ember-scarab', 'refracting-shard-drone', 'derelict-guard-hulk'] },
      { at: 395, rate: 0.92, pack: 4, pool: ['null-leech', 'grave-egg', 'ash-wraith', 'scrap-ripper', 'cinder-kamikaze'] },
      { at: 425, rate: 0.68, pack: 4, pool: ['bulwark', 'lancer', 'derelict-guard-hulk', 'ember-scarab', 'refracting-shard-drone'] }
    ],
    mods: {
      enemyHp: 1.25,
      enemyDmg: 1.1
    },
    regionBosses: [
      { at: 60,  region: 'meridian-verge',       x: 720,   y: -620,  hpMul: 0.85 },
      { at: 145, region: 'ember-drift',          x: 3040,  y: -1080, hpMul: 0.9 },
      { at: 230, region: 'crystal-shoals',       x: 5060,  y: -1640, hpMul: 0.95 },
      { at: 320, region: 'void-rift',            x: -3020, y: 1420,  hpMul: 1.0 },
      { at: 410, region: 'aurelion-graveyard',  x: -5260, y: 1160,  hpMul: 1.1 }
    ],
    finalBoss: null,
    objectives: [
      { id: 'survive', type: 'survive', label: 'SURVIVE THE SWARMFALL' },
      { id: 'lords', type: 'boss', label: 'DEFEAT FIVE SWARM LORDS', count: 5 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'hull', pct: 30, label: 'HULL 30 PERCENT OR MORE' },
      { type: 'time', under: 470, label: 'WIN BEFORE 07:50' }
    ],
    events: [
      { at: 50, banner: ['SWARMFALL', 'FIVE LORDS ANSWER ONE CALL'], heat: true, callout: 'all five lords answer one call' },
      { at: 58, banner: ['PROBOSCIS PRIME', 'MERIDIAN VERGE LORD INBOUND'] },
      { at: 112, grantBonus: 'aegis', callout: 'brace for the next lord' },
      { at: 143, banner: ['CINDER HAEMATARCH', 'EMBER DRIFT LORD INBOUND'] },
      { at: 196, grantBonus: 'overcharge', callout: 'reload before the next answer' },
      { at: 228, banner: ['GLASSWING TYRANT', 'CRYSTAL SHOALS LORD INBOUND'] },
      { at: 274, grantBonus: 'wing', callout: 'wing link ready' },
      { at: 318, banner: ['NULL PROBOSCIS', 'VOID RIFT LORD INBOUND'] },
      { at: 370, grantBonus: 'overcharge', callout: 'keep the formation firing' },
      { at: 408, banner: ['CARRION QUEEN', 'AURELION GRAVEYARD LORD INBOUND'] }
    ]
  };
}());
