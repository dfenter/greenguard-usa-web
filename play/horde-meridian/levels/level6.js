(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[6] = {
    id: 6,
    key: 'graveyard-requiem',
    name: 'GRAVEYARD REQUIEM',
    tagline: 'DEAD HULKS STILL BREED',
    briefing: [
      'Dead capital ships drift without signals.',
      'Something is nesting in the wrecks.',
      'Break the Queen before the hull gives.'
    ],
    region: 'aurelion-graveyard',
    duration: 390,
    waves: [
      { at: 0,   rate: 1.08, pack: 1, pool: ['drifter', 'salvage-swarm'] },
      { at: 22,  rate: 0.90, pack: 1, pool: ['salvage-swarm', 'scrap-ripper', 'sprinter'] },
      { at: 54,  rate: 0.78, pack: 2, pool: ['salvage-swarm', 'scrap-ripper', 'grave-egg'] },
      { at: 94,  rate: 0.68, pack: 2, pool: ['salvage-swarm', 'scrap-ripper', 'grave-egg', 'drifter'] },
      { at: 136, rate: 0.59, pack: 2, pool: ['derelict-guard-hulk', 'salvage-swarm', 'scrap-ripper', 'grave-egg'] },
      { at: 180, rate: 0.51, pack: 3, pool: ['derelict-guard-hulk', 'salvage-swarm', 'scrap-ripper', 'grave-egg', 'sprinter'] },
      { at: 226, rate: 0.44, pack: 3, pool: ['derelict-guard-hulk', 'salvage-swarm', 'scrap-ripper', 'grave-egg', 'bulwark'] },
      { at: 280, rate: 0.38, pack: 3, pool: ['derelict-guard-hulk', 'salvage-swarm', 'scrap-ripper', 'grave-egg', 'sapper'] },
      { at: 334, rate: 0.33, pack: 4, pool: ['derelict-guard-hulk', 'salvage-swarm', 'scrap-ripper', 'grave-egg', 'weaver'] },
      { at: 378, rate: 0.29, pack: 4, pool: ['derelict-guard-hulk', 'salvage-swarm', 'scrap-ripper', 'grave-egg'] }
    ],
    mods: {
      enemyHp: 1.2,
      enemyDmg: 1.1
    },
    bases: [
      { at: 92, type: 'hive', x: -5520, y: -920 },
      { at: 224, type: 'relay', x: -4680, y: 1080 }
    ],
    finalBoss: {
      type: 'region',
      region: 'aurelion-graveyard',
      at: 320,
      hpMul: 1.2
    },
    objectives: [
      { id: 'survive-graveyard', type: 'survive', label: 'SURVIVE THE GRAVEYARD' },
      { id: 'warden-bases', type: 'bases', label: 'BREAK BOTH WARDEN BASES', count: 2 },
      { id: 'carrion-queen', type: 'boss', label: 'DEFEAT CARRION QUEEN', count: 1 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'kills', atLeast: 340, label: 'CLEAR 340 HOSTILES' },
      { type: 'hull', pct: 35, label: '35% HULL REMAINING' }
    ],
    events: [
      {
        at: 0,
        banner: ['DERELICT FLEET', 'ENTRY VECTOR: AURELION GRAVEYARD'],
        callout: 'dead capital ships on drift. maintain formation.'
      },
      {
        at: 58,
        banner: ['EGG CLUSTER WARNING', 'BIO-SIGNATURES IN THE WRECKS'],
        spawnPack: { key: 'grave-egg', count: 4 },
        callout: 'egg cluster ahead. clear the nest before it opens.'
      },
      {
        at: 126,
        banner: ['HULK AMBUSH', 'GUARD FRAMES REACTIVATING'],
        spawnPack: { key: 'derelict-guard-hulk', count: 4, elite: true },
        callout: 'the dead fleet is raising its guard.'
      },
      {
        at: 170,
        banner: ['VAMPIRE ROUNDS', 'HULL DRAIN MUNITIONS ONLINE'],
        grantBonus: 'vampire',
        callout: 'vampire rounds drop near the nest.'
      },
      {
        at: 208,
        banner: ['EGG CLUSTER WARNING', 'MULTIPLE HATCHERIES DETECTED'],
        spawnPack: { key: 'grave-egg', count: 6 },
        callout: 'more eggs. the wrecks are not empty.'
      },
      {
        at: 248,
        banner: ['RELAY SIGNAL', 'THE GRAVEYARD IS WAKING AROUND YOU'],
        spawnPack: { key: 'salvage-swarm', count: 8, elite: true },
        callout: 'cut the relay before the swarm closes in.'
      },
      {
        at: 280,
        banner: ['GRAVEYARD HEAT', 'SOMETHING HAS FOUND YOUR SIGNAL'],
        heat: true,
        callout: 'heat rising from the wreck field.'
      },
      {
        at: 320,
        banner: ['CARRION QUEEN', 'HATCHERIES ACTIVE // POP THE CLUSTERS'],
        callout: 'carrion queen on approach. break the hatcheries.'
      },
      {
        at: 364,
        banner: ['PURGE CACHE', 'CLEAR THE NEST BEFORE IMPACT'],
        grantBonus: 'purge',
        callout: 'purge wave drop. burn through the last swarm.'
      }
    ],
    music: 'base'
  };
}());
