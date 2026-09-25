(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[1] = {
    id: 1,
    key: 'salvage-run',
    name: 'SALVAGE RUN',
    tagline: 'SCRAP THE DEAD FLEET',
    briefing: [
      'THE WARDEN FLEET IS GONE.',
      'YOU ARE SALVAGE CREW NOW.',
      'STRIP THE HULKS. STAY ALIVE.'
    ],
    region: 'aurelion-graveyard',
    duration: 150,
    waves: [
      { at: 0, rate: 0.68, pack: 2, pool: ['drifter', 'sprinter'] },
      { at: 18, rate: 0.6, pack: 2, pool: ['drifter', 'sprinter', 'salvage-swarm'] },
      { at: 40, rate: 0.55, pack: 2, pool: ['drifter', 'sprinter', 'salvage-swarm', 'bulwark'] },
      { at: 66, rate: 0.5, pack: 2, pool: ['sprinter', 'salvage-swarm', 'scrap-ripper'] },
      { at: 96, rate: 0.46, pack: 2, pool: ['sprinter', 'salvage-swarm', 'scrap-ripper', 'bulwark'] },
      { at: 122, rate: 0.42, pack: 3, pool: ['sprinter', 'salvage-swarm', 'scrap-ripper'] }
    ],
    mods: {
      spawnRate: 0.65,
      enemyHp: 0.8,
      enemyDmg: 0.85
    },
    bases: [],
    regionBosses: [],
    finalBoss: null,
    objectives: [
      { id: 'survive-scrapfield', type: 'survive', label: 'HOLD THE SCRAPFIELD' }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'hull', pct: 60, label: 'HULL 60% OR BETTER' },
      { type: 'kills', atLeast: 70, label: '70 HOSTILES CLEARED' }
    ],
    events: [
      {
        at: 0,
        banner: ['HULKS AHEAD', 'DEAD FLEET DRIFTING'],
        callout: 'salvage crew online // strip the wrecks'
      },
      {
        at: 22,
        banner: ['SCRAP STIRS', 'SOMETHING MOVES INSIDE'],
        spawnPack: { key: 'salvage-swarm', count: 4 }
      },
      {
        at: 60,
        banner: ['GEM VEIN', 'CRACK THE PLATING'],
        gems: { count: 7, value: 1 }
      },
      {
        at: 88,
        banner: ['ARMOR CACHE', 'AEGIS PLATING FOUND'],
        grantBonus: 'aegis'
      },
      {
        at: 110,
        banner: ['DEEP GEM VEIN', 'RICH SIGNAL BELOW'],
        gems: { count: 9, value: 2 }
      },
      {
        at: 130,
        banner: ['LAST HAUL', 'CLEAR TO EXTRACTION'],
        spawnPack: { key: 'scrap-ripper', count: 5 },
        callout: 'final run // hold the line'
      }
    ],
    music: 'base',
    cutscenes: {
      intro: {
        id: 'salvage-run-intro',
        beats: [
          { kind: 'pan', dur: 2, toX: 0, toY: 0 },
          { kind: 'flyin', dur: 2 },
          { kind: 'line', dur: 3, speaker: 'COMMAND', text: 'THE FLEET IS GONE. SALVAGE WHAT YOU CAN.' },
          { kind: 'burst', dur: 1.5, color: 0x8effd8 }
        ]
      },
      outro: {
        id: 'salvage-run-outro',
        beats: [
          { kind: 'line', dur: 3, speaker: 'COMMAND', text: 'SCRAPFIELD SECURE. GOOD HAUL.' },
          { kind: 'burst', dur: 2, color: 0x8effd8 }
        ]
      }
    }
  };
}());
