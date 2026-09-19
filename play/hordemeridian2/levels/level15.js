(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[15] = {
    id: 15,
    key: 'meridian-falls',
    name: 'MERIDIAN FALLS',
    tagline: 'KILL THE CORE',
    briefing: [
      'THE MERIDIAN CORE WAKES.',
      'TWO CROWNS GUARD ITS DESCENT.',
      'END IT HERE.'
    ],
    region: 'meridian-verge',
    duration: 560,
    waves: [
      { at: 0,   rate: 0.8,  pack: 2, pool: ['drifter', 'sprinter', 'bulwark'] },
      { at: 26,  rate: 0.68, pack: 2, pool: ['drifter', 'sprinter', 'cinder-kamikaze', 'blink-stalker'] },
      { at: 60,  rate: 0.58, pack: 3, pool: ['shard-larva', 'salvage-swarm', 'gravity-mite', 'sapper'] },
      { at: 100, rate: 0.5,  pack: 3, pool: ['ash-wraith', 'glasswing-drone', 'scrap-ripper', 'lancer'] },
      { at: 148, rate: 0.44, pack: 3, pool: ['blink-stalker', 'ember-scarab', 'null-leech', 'weaver', 'wall-warden', 'gem-mimic'] },
      { at: 200, rate: 0.4,  pack: 4, pool: ['derelict-guard-hulk', 'refracting-shard-drone', 'grave-egg', 'bulwark'] },
      { at: 260, rate: 0.34, pack: 4, pool: ['ember-scarab', 'null-leech', 'aegis-warden', 'void-artillery', 'rift-strafer', 'xp-leech'] },
      { at: 324, rate: 0.3,  pack: 4, pool: ['blink-stalker', 'grave-egg', 'hive-splitter', 'phase-reaver'] },
      { at: 392, rate: 0.28, pack: 5, pool: ['ember-scarab', 'derelict-guard-hulk', 'warden-titan', 'dread-lancer'] },
      { at: 460, rate: 0.24, pack: 5, pool: ['null-leech', 'aegis-warden', 'hive-splitter', 'void-artillery', 'warden-titan'] },
      { at: 520, rate: 0.22, pack: 5, pool: ['warden-titan', 'dread-lancer', 'hive-splitter', 'void-artillery', 'aegis-warden'] }
    ],
    mods: {
      spawnRate: 1.55,
      enemyHp: 1.85,
      enemyDmg: 1.4
    },
    bases: [],
    regionBosses: [],
    finalBoss: {
      type: 'core',
      at: 'duration',
      hpMul: 1.4,
      dmgMul: 1.2,
      escorts: ['ember-drift', 'void-rift']
    },
    objectives: [
      { id: 'core', type: 'boss', label: 'KILL THE MERIDIAN CORE', count: 3 },
      { id: 'purge', type: 'kills', label: 'CLEAR 400 CONTACTS', count: 400 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'level', atLeast: 28, label: 'REACH SHIP LEVEL 28' },
      { type: 'time', under: 700, label: 'WIN BEFORE 11:40' }
    ],
    events: [
      {
        at: 0,
        banner: ['CORE STIRS', 'FINAL APPROACH']
      },
      {
        at: 40,
        banner: ['THE CORE STIRS', 'FINAL DESCENT'],
        spawnPack: { key: 'blink-stalker', count: 5 }
      },
      {
        at: 90,
        banner: ['GEM CACHE', 'CORE VEIN'],
        gems: { count: 8, value: 2 }
      },
      {
        at: 160,
        banner: ['AEGIS DROP', 'TAKE THE PLATING'],
        grantBonus: 'aegis'
      },
      {
        at: 230,
        banner: ['APEX SURGE', 'HEAVY CONTACT'],
        spawnPack: { key: 'void-artillery', count: 3 },
        heat: true
      },
      {
        at: 300,
        banner: ['DEEP CACHE', 'RICH SIGNAL'],
        gems: { count: 10, value: 3 }
      },
      {
        at: 380,
        banner: ['TITAN SIGNAL', 'WARDEN TITANS UP'],
        spawnPack: { key: 'warden-titan', count: 3 }
      },
      {
        at: 450,
        banner: ['ARSENAL CACHE', 'FINAL PUSH'],
        grantBonus: 'arsenal'
      },
      {
        at: 520,
        banner: ['ESCORTS RISE', 'TWO CROWNS ARRIVE']
      },
      {
        at: 560,
        banner: ['CORE DESCENDS', 'KILL IT NOW']
      }
    ],
    music: 'heat',
    cutscenes: {
      intro: {
        id: 'meridian-falls-intro',
        beats: [
          { kind: 'pan', dur: 3, toX: 200, toY: -100 },
          { kind: 'zoom', dur: 2, to: 1.15 },
          { kind: 'flyin', dur: 2 },
          { kind: 'line', dur: 4, speaker: 'COMMAND', text: 'THE MERIDIAN CORE WAKES. END IT HERE.' },
          { kind: 'burst', dur: 1, color: 0xff9a8f }
        ]
      },
      outro: {
        id: 'meridian-falls-outro',
        beats: [
          { kind: 'line', dur: 4, speaker: 'COMMAND', text: 'THE CORE IS DOWN. THE VERGE IS OURS.' },
          { kind: 'burst', dur: 3, color: 0xffd67a }
        ]
      }
    }
  };
}());
