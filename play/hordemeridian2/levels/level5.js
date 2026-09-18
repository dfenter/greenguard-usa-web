(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[5] = {
    id: 5,
    key: 'cinder-crown',
    name: 'CINDER CROWN',
    tagline: 'ONE LORD RULES THE DRIFT',
    briefing: [
      'THE CINDER HAEMATARCH HOLDS COURT.',
      'DRIFT SWARMS SHIELD ITS THRONE.',
      'BREAK THE CROWN. END THE DRIFT.'
    ],
    region: 'ember-drift',
    duration: 225,
    waves: [
      { at: 0, rate: 0.7, pack: 2, pool: ['sprinter', 'ember-scarab', 'drifter'] },
      { at: 20, rate: 0.56, pack: 3, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith'] },
      { at: 46, rate: 0.46, pack: 3, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'lancer'] },
      { at: 76, rate: 0.42, pack: 4, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'lancer'] },
      { at: 110, rate: 0.38, pack: 4, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'sapper'] },
      { at: 146, rate: 0.36, pack: 4, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'lancer', 'sapper'] },
      { at: 182, rate: 0.32, pack: 4, pool: ['cinder-kamikaze', 'ember-scarab', 'ash-wraith', 'lancer'] }
    ],
    mods: {
      spawnRate: 0.8,
      enemyHp: 1.05,
      enemyDmg: 0.95
    },
    bases: [],
    regionBosses: [
      { at: 86, region: 'ember-drift', x: 3040, y: -1080, hpMul: 1.0, dmgMul: 1.0 }
    ],
    finalBoss: null,
    objectives: [
      { id: 'boss-haematarch', type: 'boss', label: 'BREAK THE CINDER CROWN', count: 1 },
      { id: 'survive-court', type: 'survive', label: 'HOLD THE DRIFT COURT' }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'time', under: 200, label: 'CLEAR UNDER 200 SECONDS' },
      { type: 'hull', pct: 45, label: 'HULL 45% OR BETTER' }
    ],
    events: [
      {
        at: 0,
        banner: ['CINDER CROWN', 'LORD OF DRIFT']
      },
      {
        at: 24,
        banner: ['COURT GUARD', 'SCARABS FORM RANKS'],
        spawnPack: { key: 'ember-scarab', count: 5 }
      },
      {
        at: 50,
        banner: ['GEM CACHE', 'DRIFT SIGNAL FOUND'],
        gems: { count: 7, value: 1 }
      },
      {
        at: 70,
        banner: ['LORD STIRS', 'THRONE POWERING UP']
      },
      {
        at: 86,
        banner: ['LORD ARRIVES', 'CINDER HAEMATARCH LIVE'],
        heat: true
      },
      {
        at: 120,
        banner: ['EMBER CACHE', 'ORDNANCE RECOVERED'],
        grantBonus: 'arsenal'
      },
      {
        at: 160,
        banner: ['ASH SURGE', 'WRAITHS FLANK THRONE'],
        spawnPack: { key: 'ash-wraith', count: 5, elite: true }
      },
      {
        at: 200,
        banner: ['CROWN BREAKING', 'FINISH THE LORD']
      }
    ],
    music: 'heat'
  };
}());
