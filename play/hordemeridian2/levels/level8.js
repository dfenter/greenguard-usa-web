(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[8] = {
    id: 8,
    key: 'shard-requiem',
    name: 'SHARD REQUIEM',
    tagline: 'TYRANT ON THE REFRACTION',
    briefing: [
      'THE GLASSWING TYRANT HOLDS THE DEEP SHOALS.',
      'STRIP ITS RELAY SUPPORT FIRST.',
      'THEN CLOSE THE REQUIEM.'
    ],
    region: 'crystal-shoals',
    duration: 270,
    waves: [
      { at: 0,   rate: 0.82, pack: 2, pool: ['shard-larva', 'sprinter'] },
      { at: 24,  rate: 0.72, pack: 2, pool: ['shard-larva', 'glasswing-drone', 'bulwark'] },
      { at: 54,  rate: 0.64, pack: 2, pool: ['glasswing-drone', 'refracting-shard-drone', 'shard-larva'] },
      { at: 88,  rate: 0.58, pack: 3, pool: ['glasswing-drone', 'refracting-shard-drone', 'lancer'] },
      { at: 124, rate: 0.52, pack: 3, pool: ['refracting-shard-drone', 'lancer', 'weaver', 'sapper'] },
      { at: 160, rate: 0.46, pack: 3, pool: ['refracting-shard-drone', 'lancer', 'weaver', 'sapper', 'bulwark'] },
      { at: 200, rate: 0.40, pack: 4, pool: ['refracting-shard-drone', 'lancer', 'sapper', 'bulwark'] },
      { at: 236, rate: 0.34, pack: 4, pool: ['refracting-shard-drone', 'lancer', 'sapper', 'bulwark', 'weaver'] }
    ],
    mods: {
      enemyHp: 1.25,
      enemyDmg: 1.18,
      spawnRate: 1.15
    },
    bases: [
      { at: 46,  type: 'relay', x: 4460, y: -1080 },
      { at: 118, type: 'relay', x: 5720, y: 1260 }
    ],
    regionBosses: [
      { at: 190, region: 'crystal-shoals', x: 5060, y: -1640, hpMul: 1.1 }
    ],
    finalBoss: null,
    objectives: [
      { id: 'survive-requiem', type: 'survive', label: 'SURVIVE THE REQUIEM' },
      { id: 'break-relays', type: 'bases', label: 'BREAK BOTH RELAYS', count: 2 },
      { id: 'kill-tyrant', type: 'boss', label: 'SHATTER THE TYRANT', count: 1 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'hull', pct: 55, label: '55 PERCENT HULL REMAINING' },
      { type: 'time', under: 255, label: 'CLEAR BEFORE 4:15' }
    ],
    events: [
      { at: 0, banner: ['SHARD REQUIEM', 'TYRANT SIGNAL DEEP'] },
      { at: 46, banner: ['RELAY ONE', 'STRIPPING SUPPORT'] },
      { at: 80, grantBonus: 'arsenal' },
      { at: 110, spawnPack: { key: 'refracting-shard-drone', count: 5, elite: true } },
      { at: 118, banner: ['RELAY TWO', 'STRIPPING SUPPORT'] },
      { at: 150, gems: { count: 8, value: 2 } },
      { at: 170, spawnPack: { key: 'glasswing-drone', count: 6, elite: true } },
      { at: 190, banner: ['GLASSWING TYRANT', 'REFRACTION FIELD LIVE'], heat: true },
      { at: 230, grantBonus: 'vampire' }
    ],
    music: 'heat'
  };
}());
