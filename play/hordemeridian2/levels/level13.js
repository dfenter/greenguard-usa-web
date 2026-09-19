(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[13] = {
    id: 13,
    key: 'long-dark',
    name: 'LONG DARK',
    tagline: 'NO RELIEF IS COMING',
    briefing: [
      'THE RIFT HAS NO BOTTOM.',
      'NO SUPPORT WILL REACH YOU.',
      'OUTLAST WHAT COMES UP.'
    ],
    region: 'void-rift',
    duration: 440,
    waves: [
      { at: 0,   rate: 0.84, pack: 2, pool: ['drifter', 'sprinter', 'blink-stalker'] },
      { at: 24,  rate: 0.72, pack: 2, pool: ['blink-stalker', 'gravity-mite', 'sprinter'] },
      { at: 55,  rate: 0.62, pack: 2, pool: ['blink-stalker', 'null-leech', 'gravity-mite', 'lancer'] },
      { at: 92,  rate: 0.54, pack: 3, pool: ['null-leech', 'blink-stalker', 'weaver', 'sapper'] },
      { at: 134, rate: 0.48, pack: 3, pool: ['null-leech', 'gravity-mite', 'blink-stalker', 'bulwark'] },
      { at: 182, rate: 0.42, pack: 3, pool: ['null-leech', 'blink-stalker', 'weaver', 'phase-reaver', 'wing-cutter', 'nebula-burrower'] },
      { at: 232, rate: 0.38, pack: 4, pool: ['null-leech', 'gravity-mite', 'blink-stalker', 'phase-reaver', 'void-artillery'] },
      { at: 284, rate: 0.34, pack: 4, pool: ['null-leech', 'blink-stalker', 'weaver', 'void-artillery', 'hive-splitter', 'rift-strafer'] },
      { at: 338, rate: 0.3,  pack: 4, pool: ['null-leech', 'phase-reaver', 'void-artillery', 'hive-splitter', 'dread-lancer'] },
      { at: 392, rate: 0.26, pack: 5, pool: ['null-leech', 'blink-stalker', 'phase-reaver', 'void-artillery', 'hive-splitter', 'dread-lancer'] }
    ],
    mods: {
      spawnRate: 1.6,
      enemyHp: 1.7,
      enemyDmg: 1.35
    },
    bases: [],
    regionBosses: [],
    finalBoss: null,
    objectives: [
      { id: 'survive', type: 'survive', label: 'OUTLAST THE DARK' },
      { id: 'purge', type: 'kills', label: 'UNMAKE 520 CONTACTS', count: 520 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'noWingLost', label: 'NO WINGMAN LOST' },
      { type: 'kills', atLeast: 620, label: '620 HOSTILES CLEARED' }
    ],
    events: [
      {
        at: 0,
        banner: ['NO RELIEF', 'HOLD ALONE']
      },
      {
        at: 40,
        banner: ['DEEPER PULL', 'RIFT WIDENS'],
        spawnPack: { key: 'gravity-mite', count: 6 }
      },
      {
        at: 90,
        banner: ['COLD SEAM', 'LONG DARK'],
        gems: { count: 8, value: 2 }
      },
      {
        at: 150,
        banner: ['OVERDRIVE CACHE', 'TAKE IT'],
        grantBonus: 'overdrive'
      },
      {
        at: 190,
        banner: ['APEX SIGNAL', 'HEAVY CONTACT'],
        spawnPack: { key: 'phase-reaver', count: 2 },
        heat: true
      },
      {
        at: 250,
        banner: ['ARTILLERY LOCK', 'BRACE FOR FIRE'],
        spawnPack: { key: 'void-artillery', count: 2 }
      },
      {
        at: 310,
        banner: ['SPLIT SIGNAL', 'HIVE SPLITTER UP'],
        spawnPack: { key: 'hive-splitter', count: 2 }
      },
      {
        at: 370,
        banner: ['BURIED VEIN', 'DARK SIGNAL'],
        gems: { count: 10, value: 3 }
      },
      {
        at: 410,
        banner: ['LAST STRETCH', 'HOLD THE DARK'],
        spawnPack: { key: 'dread-lancer', count: 2 }
      }
    ],
    music: 'heat'
  };
}());
