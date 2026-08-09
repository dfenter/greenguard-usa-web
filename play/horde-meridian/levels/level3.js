(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[3] = {
    id: 3,
    key: 'ember-gauntlet',
    name: 'EMBER GAUNTLET',
    tagline: 'HOLD THE BURN LINE',
    briefing: [
      'RED NEBULA CROSSING. DRIFT HAZARDS ACTIVE.',
      'SILENCE BOTH HIVES BEFORE THE LINE CLOSES.',
      'HAEMATARCH DESCENDS AT 04:00.'
    ],
    region: 'ember-drift',
    duration: 300,
    waves: [
      { at: 0,   rate: 1.18, pack: 1, pool: ['drifter'] },
      { at: 26,  rate: 0.98, pack: 1, pool: ['drifter', 'cinder-kamikaze', 'ash-wraith', 'ember-scarab'] },
      { at: 62,  rate: 0.86, pack: 2, pool: ['drifter', 'sprinter', 'cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'cinder-kamikaze'] },
      { at: 102, rate: 0.76, pack: 2, pool: ['drifter', 'sapper', 'cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'ash-wraith'] },
      { at: 144, rate: 0.68, pack: 2, pool: ['sprinter', 'bulwark', 'cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'cinder-kamikaze'] },
      { at: 184, rate: 0.60, pack: 3, pool: ['sprinter', 'sapper', 'weaver', 'cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'cinder-kamikaze'] },
      { at: 224, rate: 0.54, pack: 3, pool: ['drifter', 'bulwark', 'lancer', 'cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'ash-wraith'] },
      { at: 262, rate: 0.48, pack: 4, pool: ['sprinter', 'bulwark', 'sapper', 'weaver', 'cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'cinder-kamikaze'] },
      { at: 288, rate: 0.43, pack: 4, pool: ['sprinter', 'bulwark', 'sapper', 'lancer', 'weaver', 'cinder-kamikaze', 'ash-wraith', 'ember-scarab'] }
    ],
    mods: {
      enemyHp: 1.05,
      spawnRate: 1.05
    },
    bases: [
      { at: 52,  type: 'hive', x: 2800, y: -1020 },
      { at: 146, type: 'hive', x: 3600, y: 1240 }
    ],
    regionBosses: [],
    finalBoss: {
      type: 'region',
      region: 'ember-drift',
      at: 240
    },
    objectives: [
      { id: 'survive-drift', type: 'survive', label: 'SURVIVE THE EMBER DRIFT' },
      { id: 'silence-hives', type: 'bases', label: 'SILENCE BOTH HIVES', count: 2 },
      { id: 'haematarch-down', type: 'boss', label: 'DROP THE HAEMATARCH', count: 1 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'kills', atLeast: 220, label: '220 KILLS IN THE DRIFT' },
      { type: 'hull', pct: 45, label: '45 PERCENT HULL REMAINING' }
    ],
    events: [
      { at: 0, banner: ['RED NEBULA', 'DRIFT HAZARDS ACTIVE'] },
      { at: 38, callout: 'HIVE ALARM // WEST LINE BREACHED' },
      { at: 72, spawnPack: { key: 'cinder-kamikaze', count: 5, elite: true }, callout: 'KAMIKAZE AMBUSH // BREAK THE PACK' },
      { at: 116, grantBonus: 'overdrive', callout: 'OVERDRIVE DROP // TAKE THE BURN' },
      { at: 150, callout: 'HIVE ALARM // EAST LINE BREACHED' },
      { at: 166, banner: ['BURN LINE WARNING', 'DRIFT HAZARD CROSSING'] },
      { at: 198, spawnPack: { key: 'cinder-kamikaze', count: 7, elite: true }, callout: 'KAMIKAZE AMBUSH // CUT THROUGH' },
      { at: 224, spawnPack: { key: 'cinder-kamikaze', count: 8 }, callout: 'FIRE DRIFT // BURN LINE CLOSING' },
      { at: 240, banner: ['HAEMATARCH DESCENDS', 'BURN LINES ACTIVE // KEEP MOVING'], heat: true, callout: 'HEAT SPIKE // DO NOT CROSS THE BURN LINE' }
    ],
    music: 'base'
  };
}());
