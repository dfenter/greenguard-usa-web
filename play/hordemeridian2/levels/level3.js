(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[3] = {
    id: 3,
    key: 'rimlight',
    name: 'RIMLIGHT',
    tagline: 'FIRST GUN ON THE RIM',
    briefing: [
      'EMBER DRIFT SECTOR AHEAD.',
      'A WARDEN HIVE STILL BURNS HOT.',
      'SILENCE IT AND HOLD THE RIM.'
    ],
    region: 'ember-drift',
    duration: 210,
    waves: [
      { at: 0, rate: 0.6, pack: 2, pool: ['drifter', 'sprinter', 'cinder-kamikaze'] },
      { at: 18, rate: 0.55, pack: 2, pool: ['sprinter', 'cinder-kamikaze', 'ember-scarab'] },
      { at: 40, rate: 0.5, pack: 3, pool: ['sprinter', 'cinder-kamikaze', 'ember-scarab'] },
      { at: 68, rate: 0.46, pack: 3, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith'] },
      { at: 98, rate: 0.42, pack: 3, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith'] },
      { at: 130, rate: 0.4, pack: 3, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'bulwark'] },
      { at: 164, rate: 0.36, pack: 4, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith'] },
      { at: 190, rate: 0.34, pack: 4, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'bulwark'] }
    ],
    mods: {
      spawnRate: 0.85,
      enemyHp: 0.95,
      enemyDmg: 0.95
    },
    bases: [
      { at: 60, type: 'hive', x: 3040, y: -1080 }
    ],
    regionBosses: [],
    finalBoss: null,
    objectives: [
      { id: 'survive-rim', type: 'survive', label: 'HOLD THE RIM' },
      { id: 'bases-hive', type: 'bases', label: 'SILENCE THE HIVE', count: 1 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'hull', pct: 55, label: 'HULL 55% OR BETTER' },
      { type: 'level', atLeast: 4, label: 'REACH LEVEL 4' }
    ],
    events: [
      {
        at: 0,
        banner: ['RIMLIGHT', 'FIRST GUN, RIM'],
        callout: 'hive signal hot // close and silence it'
      },
      {
        at: 24,
        banner: ['HEAT SPIKE', 'CINDER SWARM INBOUND'],
        spawnPack: { key: 'cinder-kamikaze', count: 5 }
      },
      {
        at: 60,
        banner: ['HIVE LIVE', 'GUARD ROSTER DEPLOYED'],
        callout: 'hive guards active // break the shell'
      },
      {
        at: 84,
        banner: ['GEM CACHE', 'RIM SIGNAL FOUND'],
        gems: { count: 8, value: 1 }
      },
      {
        at: 112,
        banner: ['SCARAB PACK', 'HARD SHELLS CLOSING'],
        spawnPack: { key: 'ember-scarab', count: 4, elite: true }
      },
      {
        at: 150,
        banner: ['AEGIS DROP', 'ARMOR FOUND'],
        grantBonus: 'aegis'
      },
      {
        at: 188,
        banner: ['FINAL HEAT', 'HOLD THE RIM'],
        heat: true
      }
    ],
    music: 'base'
  };
}());
