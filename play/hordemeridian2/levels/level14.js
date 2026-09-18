(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[14] = {
    id: 14,
    key: 'the-verge-burns',
    name: 'THE VERGE BURNS',
    tagline: 'THEY REACHED THE ANCHOR',
    briefing: [
      'EVERY LORD CONVERGES ON THE VERGE.',
      'THE ANCHOR CANNOT FALL.',
      'BREAK THREE CROWNS OR LOSE IT ALL.'
    ],
    region: 'meridian-verge',
    duration: 480,
    waves: [
      { at: 0,   rate: 0.82, pack: 2, pool: ['drifter', 'sprinter', 'bulwark'] },
      { at: 26,  rate: 0.7,  pack: 2, pool: ['drifter', 'sprinter', 'cinder-kamikaze', 'blink-stalker'] },
      { at: 60,  rate: 0.6,  pack: 3, pool: ['shard-larva', 'salvage-swarm', 'gravity-mite', 'sapper'] },
      { at: 100, rate: 0.52, pack: 3, pool: ['ash-wraith', 'glasswing-drone', 'scrap-ripper', 'lancer'] },
      { at: 144, rate: 0.46, pack: 3, pool: ['blink-stalker', 'ember-scarab', 'null-leech', 'weaver'] },
      { at: 192, rate: 0.4,  pack: 4, pool: ['derelict-guard-hulk', 'refracting-shard-drone', 'grave-egg', 'warden-titan'] },
      { at: 244, rate: 0.36, pack: 4, pool: ['ember-scarab', 'null-leech', 'aegis-warden', 'void-artillery'] },
      { at: 300, rate: 0.32, pack: 4, pool: ['blink-stalker', 'grave-egg', 'hive-splitter', 'phase-reaver'] },
      { at: 360, rate: 0.3,  pack: 5, pool: ['ember-scarab', 'derelict-guard-hulk', 'warden-titan', 'dread-lancer'] },
      { at: 420, rate: 0.26, pack: 5, pool: ['null-leech', 'aegis-warden', 'hive-splitter', 'void-artillery', 'warden-titan'] }
    ],
    mods: {
      spawnRate: 1.45,
      enemyHp: 1.7,
      enemyDmg: 1.3
    },
    bases: [
      { at: 50,  type: 'hive', x: 720, y: 1540 }
    ],
    regionBosses: [
      { at: 90,  region: 'ember-drift',       x: 3040,  y: -1080, hpMul: 1.0 },
      { at: 220, region: 'crystal-shoals',    x: 5060,  y: -1640, hpMul: 1.05 },
      { at: 360, region: 'aurelion-graveyard', x: -5260, y: 1160,  hpMul: 1.1 }
    ],
    finalBoss: null,
    objectives: [
      { id: 'anchor', type: 'bases', label: 'SILENCE THE ANCHOR HIVE', count: 1 },
      { id: 'crowns', type: 'boss', label: 'BREAK THREE CROWNS', count: 3 },
      { id: 'survive', type: 'survive', label: 'HOLD THE VERGE' }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'kills', atLeast: 260, label: '260 HOSTILES CLEARED' },
      { type: 'hull', pct: 25, label: '25 PERCENT HULL REMAINING' }
    ],
    events: [
      {
        at: 0,
        banner: ['ANCHOR ALARM', 'ALL LORDS INBOUND']
      },
      {
        at: 30,
        banner: ['FIRST WAVE', 'HOLD THE GATE'],
        spawnPack: { key: 'cinder-kamikaze', count: 5 }
      },
      {
        at: 70,
        banner: ['GEM CACHE', 'ANCHOR VEIN'],
        gems: { count: 8, value: 2 }
      },
      {
        at: 90,
        banner: ['EMBER LORD', 'CINDER HAEMATARCH UP']
      },
      {
        at: 150,
        banner: ['ARSENAL DROP', 'TAKE THE EDGE'],
        grantBonus: 'arsenal'
      },
      {
        at: 220,
        banner: ['SHOALS LORD', 'GLASSWING TYRANT UP'],
        heat: true
      },
      {
        at: 280,
        banner: ['APEX BREACH', 'THE GATE BENDS'],
        spawnPack: { key: 'warden-titan', count: 2 }
      },
      {
        at: 330,
        banner: ['ANCHOR CACHE', 'GRID RESERVE'],
        gems: { count: 10, value: 3 }
      },
      {
        at: 360,
        banner: ['GRAVEYARD LORD', 'CARRION QUEEN UP']
      },
      {
        at: 430,
        banner: ['LAST CROWN', 'FINISH IT']
      }
    ],
    music: 'heat'
  };
}());
