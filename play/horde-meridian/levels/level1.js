(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[1] = {
    id: 1,
    key: 'first-contact',
    name: 'FIRST CONTACT',
    tagline: 'HOLD THE VERGE',
    briefing: [
      'WELCOME TO THE LINE, ROOKIE WARDEN.',
      'AUTO-FIRE IS ONLINE. DRAG-MOVE TO EVADE.',
      'HOLD FOR 180 SECONDS.'
    ],
    region: 'meridian-verge',
    duration: 180,
    waves: [
      { at: 0, rate: 1.25, pack: 1, pool: ['drifter'] },
      { at: 36, rate: 1.08, pack: 1, pool: ['drifter', 'sprinter'] },
      { at: 78, rate: 0.94, pack: 1, pool: ['drifter', 'sprinter'] },
      { at: 110, rate: 0.80, pack: 2, pool: ['drifter', 'sprinter', 'bulwark'] },
      { at: 140, rate: 0.62, pack: 2, pool: ['drifter', 'sprinter', 'bulwark'] }
    ],
    mods: {
      spawnRate: 0.60
    },
    bases: [],
    regionBosses: [],
    finalBoss: null,
    objectives: [
      { id: 'survive-picket', type: 'survive', label: 'SURVIVE THE PICKET' }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'hull', pct: 70, label: 'HULL 70% OR BETTER' },
      { type: 'kills', atLeast: 90, label: '90 HOSTILES CLEARED' }
    ],
    events: [
      {
        at: 0,
        banner: ['PICKET LINE ACTIVE', 'WELCOME TO THE LINE, ROOKIE WARDEN'],
        callout: 'drag-move online // keep the line'
      },
      {
        at: 26,
        banner: ['FIRST AMBUSH', 'CONTACTS ON THE PICKET EDGE'],
        spawnPack: { key: 'sprinter', count: 4 }
      },
      {
        at: 92,
        banner: ['AEGIS SUPPLY DROP', 'ARMOR INBOUND // TAKE THE PICKUP'],
        grantBonus: 'aegis'
      },
      {
        at: 118,
        banner: ['GEM CACHE', 'BLUE SIGNALS INBOUND'],
        gems: { count: 8, value: 1 }
      },
      {
        at: 140,
        banner: ['ALL SIGNALS HOT', 'FINAL MINUTE // HOLD THE VERGE'],
        spawnPack: { key: 'sprinter', count: 6, elite: true },
        heat: true,
        callout: 'final minute // line integrity required'
      }
    ],
    music: 'base'
  };
}());
