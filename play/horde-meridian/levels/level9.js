(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[9] = {
    id: 9,
    key: 'meridian-core',
    name: 'THE MERIDIAN CORE',
    tagline: 'EVERYTHING CONVERGES HERE',
    briefing: [
      'The mount is charging under full load.',
      'The grid is failing under peak pressure.',
      'Hold the Core line. Make every kill count.'
    ],
    region: 'meridian-verge',
    duration: 540,
    waves: [
      { at: 0,   rate: 1.08, pack: 1, pool: ['drifter', 'sprinter'] },
      { at: 36,  rate: 0.92, pack: 1, pool: ['drifter', 'sprinter', 'cinder-kamikaze'] },
      { at: 76,  rate: 0.82, pack: 2, pool: ['drifter', 'sprinter', 'ash-wraith', 'shard-larva', 'blink-stalker'] },
      { at: 122, rate: 0.74, pack: 2, pool: ['sprinter', 'bulwark', 'cinder-kamikaze', 'glasswing-drone', 'gravity-mite'] },
      { at: 174, rate: 0.66, pack: 2, pool: ['drifter', 'sapper', 'ember-scarab', 'refracting-shard-drone', 'null-leech', 'salvage-swarm'] },
      { at: 230, rate: 0.58, pack: 3, pool: ['sprinter', 'bulwark', 'ash-wraith', 'glasswing-drone', 'blink-stalker', 'derelict-guard-hulk'] },
      { at: 290, rate: 0.51, pack: 3, pool: ['sapper', 'lancer', 'cinder-kamikaze', 'shard-larva', 'gravity-mite', 'scrap-ripper'] },
      { at: 350, rate: 0.45, pack: 3, pool: ['bulwark', 'weaver', 'ember-scarab', 'refracting-shard-drone', 'null-leech', 'grave-egg'] },
      { at: 405, rate: 0.39, pack: 4, pool: ['sprinter', 'bulwark', 'sapper', 'weaver', 'derelict-guard-hulk', 'salvage-swarm', 'scrap-ripper', 'grave-egg'] },
      { at: 450, rate: 0.34, pack: 4, pool: ['sprinter', 'lancer', 'cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'glasswing-drone', 'blink-stalker', 'null-leech'] },
      { at: 490, rate: 0.29, pack: 5, pool: ['drifter', 'bulwark', 'sapper', 'lancer', 'cinder-kamikaze', 'ember-scarab', 'null-leech', 'derelict-guard-hulk'] },
      { at: 530, rate: 0.25, pack: 5, pool: ['sprinter', 'weaver', 'ash-wraith', 'refracting-shard-drone', 'glasswing-drone', 'shard-larva', 'gravity-mite', 'salvage-swarm'] }
    ],
    mods: {
      enemyHp: 1.3,
      enemyDmg: 1.15,
      spawnRate: 1.15
    },
    finalBoss: {
      type: 'core',
      at: 'duration',
      hpMul: 1.35,
      dmgMul: 1.15,
      escorts: ['ember-drift', 'void-rift']
    },
    objectives: [
      { id: 'survive', type: 'survive', label: 'REACH THE CORE LANDING' },
      { id: 'bosses', type: 'boss', label: 'BREAK THE CORE TRIAD', count: 3 },
      { id: 'kills', type: 'kills', label: 'ERASE 500 HOSTILES', count: 500 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'hull', pct: 35, label: '35 PERCENT HULL REMAINING' },
      { type: 'time', under: 585, label: 'WIN BEFORE 9:45' }
    ],
    events: [
      { at: 24, banner: ['MOUNT CHARGE', 'ANCHOR GRID RISING'] },
      { at: 58, gems: { count: 5, value: 2 } },
      { at: 108, banner: ['PICKET BREAK', 'CLASSIC ELITES INBOUND'], spawnPack: { key: 'sprinter', count: 5, elite: true } },
      { at: 150, banner: ['SIGNALS CONVERGE', 'ALL REGION SIGNALS CONVERGE'] },
      { at: 192, gems: { count: 6, value: 2 } },
      { at: 244, banner: ['HEAVY CONTACT', 'ELITE BULWARKS ON GRID'], spawnPack: { key: 'bulwark', count: 3, elite: true } },
      { at: 300, banner: ['GRID LOAD RISING', 'THE MOUNT IS TAKING THE LOAD'] },
      { at: 344, gems: { count: 7, value: 2 } },
      { at: 396, banner: ['GRID FAILURE', 'ANCHORS DROPPING OFFLINE'] },
      { at: 438, gems: { count: 8, value: 2 } },
      { at: 480, banner: ['HEAT LOCK', 'NO COOLING // HOLD THE LINE'], heat: true },
      { at: 505, grantBonus: 'aegis', callout: 'aegis online // survive the landing' },
      { at: 520, grantBonus: 'overcharge', callout: 'overcharge live // burn through the answer' },
      { at: 540, banner: ['THE CORE DESCENDS', 'MERIDIAN ANSWER CONFIRMED'] }
    ]
  };
}());
