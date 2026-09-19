(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[9] = {
    id: 9,
    key: 'blink-protocol',
    name: 'BLINK PROTOCOL',
    tagline: 'NOTHING STAYS WHERE IT WAS',
    briefing: [
      'THE RIFT FOLDS SPACE AROUND YOU.',
      'APEX SIGNATURES CONFIRMED LATE RUN.',
      'HOLD THE FOLD UNTIL IT CLOSES.'
    ],
    region: 'void-rift',
    duration: 300,
    waves: [
      { at: 0,   rate: 0.78, pack: 2, pool: ['blink-stalker', 'gravity-mite'] },
      { at: 24,  rate: 0.70, pack: 2, pool: ['blink-stalker', 'gravity-mite', 'sprinter'] },
      { at: 54,  rate: 0.62, pack: 2, pool: ['blink-stalker', 'gravity-mite', 'null-leech'] },
      { at: 88,  rate: 0.56, pack: 3, pool: ['blink-stalker', 'gravity-mite', 'null-leech', 'lancer'] },
      { at: 122, rate: 0.50, pack: 3, pool: ['blink-stalker', 'null-leech', 'lancer', 'weaver', 'wing-cutter'] },
      { at: 130, rate: 0.50, pack: 3, pool: ['blink-stalker', 'null-leech', 'lancer', 'phase-reaver'] },
      { at: 160, rate: 0.44, pack: 3, pool: ['null-leech', 'lancer', 'weaver', 'sapper', 'phase-reaver', 'rift-strafer', 'nebula-burrower'] },
      { at: 200, rate: 0.38, pack: 4, pool: ['null-leech', 'lancer', 'sapper', 'phase-reaver', 'hive-splitter'] },
      { at: 240, rate: 0.32, pack: 4, pool: ['null-leech', 'lancer', 'sapper', 'phase-reaver', 'hive-splitter'] },
      { at: 275, rate: 0.28, pack: 5, pool: ['null-leech', 'lancer', 'phase-reaver', 'hive-splitter', 'void-artillery'] }
    ],
    mods: {
      enemyHp: 1.3,
      enemyDmg: 1.22,
      spawnRate: 1.25
    },
    bases: [],
    regionBosses: [],
    finalBoss: null,
    objectives: [
      { id: 'survive-fold', type: 'survive', label: 'SURVIVE THE FOLD' },
      { id: 'fold-kills', type: 'kills', label: 'BREAK 300 HOSTILES', count: 300 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'hull', pct: 35, label: '35 PERCENT HULL REMAINING' },
      { type: 'kills', atLeast: 340, label: '340 HOSTILES BROKEN' }
    ],
    events: [
      { at: 0, banner: ['BLINK PROTOCOL', 'FOLD ACTIVE'] },
      { at: 30, spawnPack: { key: 'blink-stalker', count: 7 } },
      { at: 66, banner: ['FOLD SPIKE', 'SPACE IS BENDING'], spawnPack: { key: 'gravity-mite', count: 6, elite: true } },
      { at: 100, grantBonus: 'dilation' },
      { at: 130, banner: ['APEX SIGNATURE', 'PHASE REAVER CONFIRMED'], spawnPack: { key: 'phase-reaver', count: 2, elite: true } },
      { at: 165, gems: { count: 8, value: 2 } },
      { at: 195, banner: ['SPLITTER BLOOM', 'HIVE SIGNAL FORKING'], spawnPack: { key: 'hive-splitter', count: 3, elite: true } },
      { at: 230, grantBonus: 'gravity' },
      { at: 260, banner: ['FOLD COLLAPSE', 'CLOSE OUT NOW'], spawnPack: { key: 'void-artillery', count: 2, elite: true }, heat: true }
    ],
    music: 'base'
  };
}());
