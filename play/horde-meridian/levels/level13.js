(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[13] = {
    id: 13,
    key: 'deep-meridian',
    name: 'DEEP MERIDIAN',
    tagline: 'THE SECOND CORE ANSWERS',
    briefing: [
      'A second Core signal under the grid.',
      'Every sector empties toward the mount.',
      'Five crowns stand between you and it.'
    ],
    region: 'meridian-verge',
    duration: 560,
    waves: [
      { at: 0,   rate: 1.0,  pack: 1, pool: ['drifter', 'sprinter'] },
      { at: 30,  rate: 0.86, pack: 2, pool: ['sprinter', 'cinder-kamikaze', 'shard-larva'] },
      { at: 70,  rate: 0.74, pack: 2, pool: ['blink-stalker', 'salvage-swarm', 'cinder-kamikaze', 'sapper'] },
      { at: 115, rate: 0.64, pack: 3, pool: ['ash-wraith', 'glasswing-drone', 'gravity-mite', 'scrap-ripper'] },
      { at: 165, rate: 0.55, pack: 3, pool: ['ember-scarab', 'null-leech', 'refracting-shard-drone', 'bulwark', 'lancer'] },
      { at: 220, rate: 0.48, pack: 4, pool: ['cinder-kamikaze', 'blink-stalker', 'derelict-guard-hulk', 'weaver', 'sapper'] },
      { at: 280, rate: 0.42, pack: 4, pool: ['ash-wraith', 'ember-scarab', 'null-leech', 'glasswing-drone', 'scrap-ripper', 'lancer'] },
      { at: 340, rate: 0.36, pack: 5, pool: ['cinder-kamikaze', 'blink-stalker', 'derelict-guard-hulk', 'grave-egg', 'bulwark', 'sapper'] },
      { at: 400, rate: 0.31, pack: 5, pool: ['ember-scarab', 'ash-wraith', 'null-leech', 'refracting-shard-drone', 'salvage-swarm', 'weaver'] },
      { at: 460, rate: 0.27, pack: 5, pool: ['cinder-kamikaze', 'blink-stalker', 'derelict-guard-hulk', 'ember-scarab', 'null-leech', 'lancer'] },
      { at: 520, rate: 0.24, pack: 5, pool: ['sprinter', 'cinder-kamikaze', 'ash-wraith', 'glasswing-drone', 'gravity-mite', 'salvage-swarm', 'scrap-ripper', 'shard-larva'] }
    ],
    mods: {
      enemyHp: 1.5,
      enemyDmg: 1.25,
      spawnRate: 1.25
    },
    bases: [
      { at: 40,  type: 'relay',   x: -900,  y: -1400 },
      { at: 150, type: 'bastion', x: 1100,  y: 1500 },
      { at: 270, type: 'hive',    x: -300,  y: 2000 }
    ],
    regionBosses: [
      { at: 120, region: 'meridian-verge', x: 700,   y: -900, hpMul: 1.2, dmgMul: 1.1 },
      { at: 330, region: 'void-rift',      x: -1100, y: 600,  hpMul: 1.3, dmgMul: 1.15 }
    ],
    finalBoss: {
      type: 'core',
      at: 'duration',
      hpMul: 1.6,
      dmgMul: 1.25,
      escorts: ['crystal-shoals', 'aurelion-graveyard']
    },
    objectives: [
      { id: 'survive', type: 'survive', label: 'REACH THE DEEP LANDING' },
      { id: 'crowns', type: 'boss', label: 'BREAK THE FIVE CROWNS', count: 5 },
      { id: 'purge', type: 'kills', label: 'ERASE 600 HOSTILES', count: 600 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'hull', pct: 30, label: '30 PERCENT HULL REMAINING' },
      { type: 'time', under: 615, label: 'WIN BEFORE 10:15' }
    ],
    events: [
      { at: 18, banner: ['DEEP SIGNAL', 'A SECOND CORE UNDER THE GRID'], callout: 'the beacon carries the route // trust it' },
      { at: 60, gems: { count: 5, value: 2 } },
      { at: 118, banner: ['FIRST CROWN', 'PROBOSCIS PRIME HOLDS THE MOUNT'] },
      { at: 175, grantBonus: 'strike-pack', callout: 'strike pack down // save charges for the crowns' },
      { at: 226, spawnPack: { key: 'derelict-guard-hulk', count: 4, elite: true }, banner: ['HULK WALL', 'ELITE GUARD ON THE APPROACH'] },
      { at: 275, gems: { count: 7, value: 2 } },
      { at: 328, banner: ['SECOND CROWN', 'THE NULL RIDES UP THE GRID'], heat: true },
      { at: 390, grantBonus: 'tempest', callout: 'arc tempest online // hold the inner line' },
      { at: 440, grantBonus: 'meteor', callout: 'meteor storm armed // the sky fights for you' },
      { at: 480, banner: ['GRID COLLAPSE', 'EVERY ANCHOR IS GONE'] },
      { at: 520, grantBonus: 'aegis', callout: 'aegis online // survive the landing' },
      { at: 545, grantBonus: 'overcharge', callout: 'overcharge live // end it' },
      { at: 560, banner: ['THE DEEP CORE', 'IT KNOWS YOUR NAME'] }
    ]
  };
}());
