(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[6] = {
    id: 6,
    key: 'glass-tide',
    name: 'GLASS TIDE',
    tagline: 'THE SHOALS CUT BACK',
    briefing: [
      'THE SHOALS ARE SURGING INWARD.',
      'REINFORCEMENT PACKS HIT ON A TIMER.',
      'BREAK EACH TIDE OR BE BURIED.'
    ],
    region: 'crystal-shoals',
    duration: 265,
    waves: [
      { at: 0,   rate: 0.92, pack: 2, pool: ['shard-larva', 'sprinter'] },
      { at: 24,  rate: 0.80, pack: 2, pool: ['shard-larva', 'glasswing-drone', 'sprinter'] },
      { at: 52,  rate: 0.72, pack: 2, pool: ['shard-larva', 'glasswing-drone', 'bulwark'] },
      { at: 84,  rate: 0.64, pack: 3, pool: ['shard-larva', 'glasswing-drone', 'refracting-shard-drone'] },
      { at: 120, rate: 0.58, pack: 3, pool: ['shard-larva', 'glasswing-drone', 'refracting-shard-drone', 'lancer'] },
      { at: 158, rate: 0.52, pack: 3, pool: ['glasswing-drone', 'refracting-shard-drone', 'lancer', 'weaver', 'gem-mimic'] },
      { at: 196, rate: 0.46, pack: 4, pool: ['glasswing-drone', 'refracting-shard-drone', 'lancer', 'sapper', 'gem-mimic'] },
      { at: 234, rate: 0.40, pack: 4, pool: ['glasswing-drone', 'refracting-shard-drone', 'lancer', 'sapper', 'bulwark'] }
    ],
    mods: {
      enemyHp: 1.14,
      enemyDmg: 1.1,
      spawnRate: 1.15
    },
    bases: [],
    regionBosses: [],
    finalBoss: null,
    objectives: [
      { id: 'survive-tide', type: 'survive', label: 'SURVIVE THE GLASS TIDE' },
      { id: 'tide-kills', type: 'kills', label: 'BREAK 240 HOSTILES', count: 240 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'kills', atLeast: 280, label: '280 HOSTILES BROKEN' },
      { type: 'time', under: 250, label: 'CLEAR BEFORE 4:10' }
    ],
    events: [
      { at: 0, banner: ['GLASS TIDE', 'SURGE PROTOCOL LIVE'] },
      { at: 30, spawnPack: { key: 'shard-larva', count: 8 } },
      { at: 66, banner: ['TIDE PACK', 'REINFORCEMENTS INBOUND'], spawnPack: { key: 'glasswing-drone', count: 6, elite: true } },
      { at: 96, grantBonus: 'overdrive' },
      { at: 128, banner: ['SECOND SURGE', 'HOLD THE LANE'], spawnPack: { key: 'refracting-shard-drone', count: 5, elite: true } },
      { at: 150, gems: { count: 8, value: 2 } },
      { at: 172, banner: ['SHARD BLOOM', 'FULL TIDE PRESSURE'], spawnPack: { key: 'shard-larva', count: 10, elite: true } },
      { at: 200, grantBonus: 'reflector' },
      { at: 220, banner: ['LAST SURGE', 'BREAK IT HERE'], spawnPack: { key: 'glasswing-drone', count: 8, elite: true }, heat: true }
    ],
    music: 'base'
  };
}());
