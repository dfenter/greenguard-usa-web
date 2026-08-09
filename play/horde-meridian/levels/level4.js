(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[4] = {
    id: 4,
    key: 'shoal-crossing',
    name: 'SHOAL CROSSING',
    tagline: 'REFRACTION SIGNALS HOLD THE LINE',
    briefing: [
      'Crystal shoals bend every sensor return.',
      'Secure both relays before the tyrant comes.',
      'Keep the wingman in formation.'
    ],
    region: 'crystal-shoals',
    duration: 330,
    waves: [
      { at: 0,   rate: 1.08, pack: 1, pool: ['drifter', 'shard-larva'] },
      { at: 22,  rate: 0.88, pack: 1, pool: ['shard-larva', 'glasswing-drone', 'sprinter'] },
      { at: 55,  rate: 0.74, pack: 2, pool: ['refracting-shard-drone', 'glasswing-drone', 'shard-larva', 'lancer'] },
      { at: 96,  rate: 0.64, pack: 2, pool: ['refracting-shard-drone', 'glasswing-drone', 'shard-larva', 'lancer', 'sprinter'] },
      { at: 138, rate: 0.56, pack: 2, pool: ['refracting-shard-drone', 'glasswing-drone', 'shard-larva', 'lancer', 'bulwark'] },
      { at: 182, rate: 0.49, pack: 3, pool: ['refracting-shard-drone', 'glasswing-drone', 'shard-larva', 'lancer', 'weaver'] },
      { at: 226, rate: 0.43, pack: 3, pool: ['refracting-shard-drone', 'glasswing-drone', 'shard-larva', 'lancer', 'bulwark'] },
      { at: 284, rate: 0.37, pack: 4, pool: ['refracting-shard-drone', 'glasswing-drone', 'shard-larva', 'lancer', 'sapper'] }
    ],
    mods: {
      enemyHp: 1.1,
      spawnRate: 1.1
    },
    bases: [
      { at: 78, type: 'relay', x: 4380, y: -960 },
      { at: 156, type: 'relay', x: 5660, y: 1240 }
    ],
    finalBoss: {
      type: 'region',
      region: 'crystal-shoals',
      at: 270
    },
    objectives: [
      { id: 'survive-shoals', type: 'survive', label: 'SURVIVE THE SHOALS' },
      { id: 'relay-fortresses', type: 'bases', label: 'BREAK BOTH RELAYS', count: 2 },
      { id: 'glasswing-tyrant', type: 'boss', label: 'KILL THE GLASSWING TYRANT', count: 1 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'time', under: 320, label: 'CLEAR BEFORE 5:20' },
      { type: 'noWingLost', label: 'NO WINGMAN LOST' }
    ],
    events: [
      {
        at: 0,
        banner: ['ARCTIC REFRACTION', 'SENSOR GHOSTS AHEAD'],
        callout: 'glass returns are masking the first contacts.'
      },
      {
        at: 22,
        banner: ['WINGMAN SIGNAL', 'FRIENDLY REFRACTION LOCKED'],
        grantBonus: 'wing',
        callout: 'take the wingman and hold formation.'
      },
      {
        at: 66,
        banner: ['RELAY SIGNAL WARNING', 'EAST RELAY FORTRESS INBOUND'],
        callout: 'cut the relay before its signal spreads.'
      },
      {
        at: 112,
        banner: ['LARVA SWARM', 'CONTACTS BLOOM IN THE REFRACTION'],
        spawnPack: { key: 'shard-larva', count: 8 }
      },
      {
        at: 136,
        banner: ['FREEZE PULSE DROP', 'BREAK THE LARVA CURRENT'],
        grantBonus: 'freeze'
      },
      {
        at: 144,
        banner: ['RELAY SIGNAL WARNING', 'SECOND RELAY FORTRESS INBOUND'],
        callout: 'second relay signal. keep moving.'
      },
      {
        at: 214,
        banner: ['LARVA SWARM', 'THE SHOALS ARE HATCHING AGAIN'],
        spawnPack: { key: 'shard-larva', count: 10 }
      },
      {
        at: 270,
        banner: ['GLASSWING TYRANT', 'THE REFRACTION FIELD TURNS HOSTILE'],
        heat: true,
        callout: 'heat rising. break through the wing.'
      }
    ],
    music: 'base'
  };
}());
