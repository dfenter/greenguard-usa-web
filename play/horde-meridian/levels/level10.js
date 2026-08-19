(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[10] = {
    id: 10,
    key: 'ashfall-hunt',
    name: 'ASHFALL HUNT',
    tagline: 'FOLLOW THE BEACON THROUGH ASH',
    briefing: [
      'Warden forges relit across the drift.',
      'Four bases feed the new swarm.',
      'Chase the beacon. Burn each one down.'
    ],
    region: 'ember-drift',
    duration: 420,
    waves: [
      { at: 0,   rate: 1.0,  pack: 1, pool: ['drifter', 'sprinter', 'cinder-kamikaze'] },
      { at: 34,  rate: 0.86, pack: 2, pool: ['sprinter', 'cinder-kamikaze', 'ash-wraith'] },
      { at: 78,  rate: 0.74, pack: 2, pool: ['cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'sapper'] },
      { at: 130, rate: 0.64, pack: 3, pool: ['sprinter', 'cinder-kamikaze', 'ember-scarab', 'lancer'] },
      { at: 190, rate: 0.55, pack: 3, pool: ['ash-wraith', 'ember-scarab', 'sapper', 'weaver', 'cinder-kamikaze'] },
      { at: 255, rate: 0.47, pack: 4, pool: ['cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'bulwark', 'lancer'] },
      { at: 320, rate: 0.4,  pack: 4, pool: ['sprinter', 'cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'sapper', 'weaver'] },
      { at: 380, rate: 0.34, pack: 5, pool: ['cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'bulwark', 'lancer', 'sapper'] }
    ],
    mods: {
      enemyHp: 1.35,
      enemyDmg: 1.2,
      spawnRate: 1.2
    },
    bases: [
      { at: 20,  type: 'hive',    x: 2400,  y: -1200 },
      { at: 95,  type: 'bastion', x: 3600,  y: 1400 },
      { at: 190, type: 'relay',   x: 4600,  y: -1700 },
      { at: 285, type: 'hive',    x: 5400,  y: 900 }
    ],
    regionBosses: [
      { at: 350, region: 'ember-drift', x: 5000, y: -400, hpMul: 1.2, dmgMul: 1.1 }
    ],
    finalBoss: null,
    objectives: [
      { id: 'forges', type: 'bases', label: 'BURN FOUR FORGE BASES', count: 4 },
      { id: 'lord', type: 'boss', label: 'KILL THE HAEMATARCH', count: 1 },
      { id: 'survive', type: 'survive', label: 'SURVIVE THE ASHFALL' }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'hull', pct: 40, label: '40 PERCENT HULL REMAINING' },
      { type: 'time', under: 400, label: 'WIN BEFORE 6:40' }
    ],
    events: [
      { at: 12, banner: ['FORGE SIGNAL', 'FIRST BASE ON THE BEACON'], callout: 'follow the beacon arrow to the enemy base' },
      { at: 55, gems: { count: 5, value: 2 } },
      { at: 90, banner: ['SECOND SIGNAL', 'BASTION GUNS SPINNING UP'] },
      { at: 132, spawnPack: { key: 'cinder-kamikaze', count: 6, elite: true }, banner: ['ASH SQUALL', 'KAMIKAZE WING INBOUND'] },
      { at: 170, grantBonus: 'strike-pack', callout: 'strike pack down // bank two airstrikes' },
      { at: 196, banner: ['THIRD SIGNAL', 'RELAY FORTRESS ON GRID'] },
      { at: 240, gems: { count: 6, value: 2 } },
      { at: 288, banner: ['LAST FORGE', 'THE HIVE HIDES DEEP IN THE DRIFT'] },
      { at: 315, grantBonus: 'meteor', callout: 'meteor storm armed // clear the approach' },
      { at: 348, banner: ['HAEMATARCH', 'THE EMBER LORD ANSWERS'], heat: true },
      { at: 386, gems: { count: 7, value: 2 } }
    ]
  };
}());
