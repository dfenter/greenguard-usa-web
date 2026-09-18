(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[7] = {
    id: 7,
    key: 'prism-siege',
    name: 'PRISM SIEGE',
    tagline: 'THREE RELAYS. ONE PASS.',
    briefing: [
      'THREE RELAY FORTRESSES LIGHT THE SHOALS.',
      'DROP ALL THREE IN A SINGLE PASS.',
      'THE TYRANT WATCHES FROM THE DEEP GLASS.'
    ],
    region: 'crystal-shoals',
    duration: 290,
    waves: [
      { at: 0,   rate: 0.86, pack: 2, pool: ['shard-larva', 'sprinter'] },
      { at: 26,  rate: 0.76, pack: 2, pool: ['shard-larva', 'glasswing-drone', 'bulwark'] },
      { at: 58,  rate: 0.68, pack: 2, pool: ['glasswing-drone', 'refracting-shard-drone', 'shard-larva'] },
      { at: 94,  rate: 0.62, pack: 3, pool: ['glasswing-drone', 'refracting-shard-drone', 'lancer'] },
      { at: 132, rate: 0.56, pack: 3, pool: ['glasswing-drone', 'refracting-shard-drone', 'lancer', 'weaver'] },
      { at: 170, rate: 0.50, pack: 3, pool: ['refracting-shard-drone', 'lancer', 'weaver', 'sapper'] },
      { at: 210, rate: 0.44, pack: 4, pool: ['refracting-shard-drone', 'lancer', 'weaver', 'sapper', 'bulwark'] },
      { at: 250, rate: 0.38, pack: 4, pool: ['refracting-shard-drone', 'lancer', 'sapper', 'bulwark'] }
    ],
    mods: {
      enemyHp: 1.18,
      enemyDmg: 1.12,
      spawnRate: 1.2
    },
    bases: [
      { at: 40,  type: 'relay', x: 4320, y: -1020 },
      { at: 120, type: 'relay', x: 5640, y: 1180 },
      { at: 200, type: 'relay', x: 4980, y: -1580 }
    ],
    regionBosses: [],
    finalBoss: null,
    objectives: [
      { id: 'survive-siege', type: 'survive', label: 'SURVIVE THE SIEGE' },
      { id: 'break-relays', type: 'bases', label: 'BREAK ALL THREE RELAYS', count: 3 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'level', atLeast: 16, label: 'REACH LEVEL 16' },
      { type: 'noWingLost', label: 'NO WINGMAN LOST' }
    ],
    events: [
      { at: 0, banner: ['PRISM SIEGE', 'THREE RELAYS DETECTED'] },
      { at: 40, banner: ['RELAY ONE', 'SIGNAL LOCKED'] },
      { at: 70, grantBonus: 'aegis' },
      { at: 108, spawnPack: { key: 'refracting-shard-drone', count: 5, elite: true } },
      { at: 120, banner: ['RELAY TWO', 'SIGNAL LOCKED'] },
      { at: 150, gems: { count: 7, value: 2 } },
      { at: 180, spawnPack: { key: 'glasswing-drone', count: 7, elite: true } },
      { at: 200, banner: ['RELAY THREE', 'SIGNAL LOCKED'] },
      { at: 230, grantBonus: 'chain' },
      { at: 260, banner: ['FINAL PASS', 'CLOSE THE SIGNAL'], spawnPack: { key: 'lancer', count: 5, elite: true }, heat: true }
    ],
    music: 'base'
  };
}());
