(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[2] = {
    id: 2,
    key: 'proboscis-hunt',
    name: 'PROBOSCIS HUNT',
    tagline: 'TRACK THE BLOODFEEDER',
    briefing: [
      'Bloodfeeder signal moves through the Verge.',
      'Keep the console locked on its approach.',
      'Destroy PROBOSCIS PRIME.'
    ],
    region: 'meridian-verge',
    duration: 270,
    waves: [
      { at: 0, rate: 1.08, pack: 1, pool: ['drifter'] },
      { at: 22, rate: 0.90, pack: 1, pool: ['drifter', 'sprinter'] },
      { at: 56, rate: 0.79, pack: 1, pool: ['drifter', 'sprinter', 'bulwark'] },
      { at: 94, rate: 0.70, pack: 2, pool: ['drifter', 'sprinter', 'bulwark', 'sapper'] },
      { at: 136, rate: 0.63, pack: 2, pool: ['sprinter', 'bulwark', 'sapper', 'weaver'] },
      { at: 180, rate: 0.57, pack: 2, pool: ['sprinter', 'bulwark', 'sapper', 'weaver'] },
      { at: 225, rate: 0.52, pack: 3, pool: ['sprinter', 'bulwark', 'sapper', 'weaver'] }
    ],
    mods: {
      enemyHp: 1.08,
      enemyDmg: 1.08,
      enemySpeed: 1.02,
      spawnRate: 1.04,
      xp: 1.0
    },
    finalBoss: {
      type: 'region',
      region: 'meridian-verge',
      at: 210
    },
    objectives: [
      { id: 'survive', type: 'survive', label: 'SURVIVE THE HUNT' },
      { id: 'boss', type: 'boss', label: 'DESTROY PROBOSCIS PRIME', count: 1 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'time', under: 260, label: 'CLEAR BEFORE 4:20' },
      { type: 'hull', pct: 50, label: 'FINISH WITH 50% HULL' }
    ],
    events: [
      {
        at: 0,
        banner: ['PROBOSCIS HUNT', 'TRACK THE BLOODFEEDER SIGNAL'],
        callout: 'keep the console on the signal.'
      },
      { at: 60, grantBonus: 'wing', callout: 'wing supply inbound.' },
      { at: 112, callout: 'drone signal acquired.' },
      {
        at: 150,
        spawnPack: { key: 'sapper', count: 2, elite: true },
        callout: 'ambush pack. signal strength rising.'
      },
      { at: 170, callout: 'drone signal closing.' },
      {
        at: 198,
        heat: true,
        callout: 'drone signal is inside the perimeter.'
      },
      {
        at: 210,
        banner: ['PROBOSCIS PRIME', 'BLOODFEEDER SIGNAL LOCKED'],
        callout: 'proboscis prime is on the grid.'
      }
    ],
    music: 'base'
  };
}());
