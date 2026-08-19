(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[12] = {
    id: 12,
    key: 'rift-storm',
    name: 'RIFT STORM',
    tagline: 'THREE LORDS RIDE THE TEAR',
    briefing: [
      'The rift is spitting out Swarm Lords.',
      'Three crowns, three signals, one storm.',
      'Hunt them down before the tear closes.'
    ],
    region: 'void-rift',
    duration: 480,
    waves: [
      { at: 0,   rate: 0.94, pack: 1, pool: ['drifter', 'gravity-mite'] },
      { at: 28,  rate: 0.8,  pack: 2, pool: ['blink-stalker', 'gravity-mite', 'sprinter'] },
      { at: 68,  rate: 0.68, pack: 2, pool: ['blink-stalker', 'null-leech', 'gravity-mite'] },
      { at: 115, rate: 0.58, pack: 3, pool: ['null-leech', 'blink-stalker', 'shard-larva', 'glasswing-drone'] },
      { at: 170, rate: 0.5,  pack: 3, pool: ['blink-stalker', 'glasswing-drone', 'refracting-shard-drone', 'sapper'] },
      { at: 232, rate: 0.43, pack: 4, pool: ['null-leech', 'blink-stalker', 'gravity-mite', 'cinder-kamikaze', 'lancer'] },
      { at: 298, rate: 0.37, pack: 4, pool: ['blink-stalker', 'null-leech', 'glasswing-drone', 'ash-wraith', 'bulwark'] },
      { at: 365, rate: 0.31, pack: 5, pool: ['null-leech', 'blink-stalker', 'gravity-mite', 'refracting-shard-drone', 'sapper', 'weaver'] },
      { at: 435, rate: 0.26, pack: 5, pool: ['blink-stalker', 'null-leech', 'cinder-kamikaze', 'ash-wraith', 'glasswing-drone', 'lancer'] }
    ],
    mods: {
      enemyHp: 1.45,
      enemyDmg: 1.25,
      spawnRate: 1.25
    },
    bases: [
      { at: 60,  type: 'relay',   x: -3400, y: -1500 },
      { at: 210, type: 'bastion', x: -2400, y: 1600 }
    ],
    regionBosses: [
      { at: 70,  region: 'void-rift',      x: -3000, y: 800,   hpMul: 1.1,  dmgMul: 1.1 },
      { at: 210, region: 'crystal-shoals', x: -2200, y: -1200, hpMul: 1.2,  dmgMul: 1.1 },
      { at: 350, region: 'ember-drift',    x: -3600, y: 200,   hpMul: 1.3,  dmgMul: 1.15 }
    ],
    finalBoss: null,
    objectives: [
      { id: 'crowns', type: 'boss', label: 'KILL THREE SWARM LORDS', count: 3 },
      { id: 'jammers', type: 'bases', label: 'DROP BOTH RIFT BASES', count: 2 },
      { id: 'survive', type: 'survive', label: 'OUTLAST THE STORM' }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'hull', pct: 45, label: '45 PERCENT HULL REMAINING' },
      { type: 'level', atLeast: 24, label: 'REACH SHIP LEVEL 24' }
    ],
    events: [
      { at: 12, banner: ['RIFT STORM', 'LIGHTNING ON THE SCANNER'], callout: 'three lords will ride the tear // watch the beacon' },
      { at: 45, gems: { count: 5, value: 2 } },
      { at: 68, banner: ['FIRST CROWN', 'NULL PROBOSCIS BREACHES'] },
      { at: 120, grantBonus: 'prism-array', callout: 'prism array live // beams sweep from your hull' },
      { at: 160, gems: { count: 6, value: 2 } },
      { at: 208, banner: ['SECOND CROWN', 'GLASSWING TYRANT CROSSES OVER'], heat: true },
      { at: 262, grantBonus: 'strike-pack', callout: 'strike pack down // spend it on the tyrant' },
      { at: 300, spawnPack: { key: 'blink-stalker', count: 6, elite: true }, banner: ['BLINK PACK', 'STALKERS HUNT IN ECHO'] },
      { at: 348, banner: ['THIRD CROWN', 'THE HAEMATARCH RIDES THE TEAR'] },
      { at: 400, grantBonus: 'tempest', callout: 'arc tempest online // answer the storm in kind' },
      { at: 445, gems: { count: 8, value: 2 } }
    ]
  };
}());
