(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[4] = {
    id: 4,
    key: 'ash-harvest',
    name: 'ASH HARVEST',
    tagline: 'BURN WHAT BURNS BACK',
    briefing: [
      'TWO HIVES FEED THE DRIFT FIRE.',
      'HARVEST THE GEM VEINS BETWEEN.',
      'THE ASH BITES BACK.'
    ],
    region: 'ember-drift',
    duration: 240,
    waves: [
      { at: 0, rate: 0.68, pack: 2, pool: ['sprinter', 'drifter', 'ember-scarab'] },
      { at: 20, rate: 0.5, pack: 3, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith'] },
      { at: 44, rate: 0.46, pack: 3, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'lancer'] },
      { at: 72, rate: 0.42, pack: 3, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'lancer'] },
      { at: 102, rate: 0.4, pack: 4, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'lancer', 'sapper'] },
      { at: 136, rate: 0.36, pack: 4, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'lancer', 'sapper'] },
      { at: 170, rate: 0.34, pack: 4, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'sapper'] },
      { at: 204, rate: 0.3, pack: 4, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'lancer', 'sapper'] }
    ],
    mods: {
      spawnRate: 0.95,
      enemyHp: 1.05,
      enemyDmg: 1.0
    },
    bases: [
      { at: 50, type: 'hive', x: 3040, y: -1080 },
      { at: 150, type: 'bastion', x: 4200, y: -600 }
    ],
    regionBosses: [],
    finalBoss: null,
    objectives: [
      { id: 'bases-twin', type: 'bases', label: 'BURN BOTH HIVES', count: 2 },
      { id: 'kills-ash', type: 'kills', label: 'CLEAR 160 HOSTILES', count: 160 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'kills', atLeast: 190, label: '190 HOSTILES CLEARED' },
      { type: 'noWingLost', label: 'NO WINGMAN LOST' }
    ],
    events: [
      {
        at: 0,
        banner: ['ASH HARVEST', 'TWIN HIVES DETECTED']
      },
      {
        at: 26,
        banner: ['GEM VEIN', 'FIRST HARVEST WINDOW'],
        gems: { count: 8, value: 1 }
      },
      {
        at: 50,
        banner: ['HIVE ONE LIVE', 'GUARD ROSTER UP'],
        spawnPack: { key: 'ember-scarab', count: 5, elite: true }
      },
      {
        at: 80,
        banner: ['ASH CACHE', 'SALVAGED GUNS'],
        grantBonus: 'arsenal'
      },
      {
        at: 110,
        banner: ['DEEP VEIN', 'RICH GEM SIGNAL'],
        gems: { count: 10, value: 2 }
      },
      {
        at: 150,
        banner: ['HIVE TWO LIVE', 'BASTION GUNS HOT'],
        spawnPack: { key: 'lancer', count: 4 }
      },
      {
        at: 190,
        banner: ['ASH SURGE', 'WRAITHS CLOSING'],
        spawnPack: { key: 'ash-wraith', count: 6, elite: true },
        heat: true
      },
      {
        at: 220,
        banner: ['FINAL BURN', 'FINISH THE HARVEST']
      }
    ],
    music: 'base'
  };
}());
