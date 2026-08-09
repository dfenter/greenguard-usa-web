(function () {
  'use strict';
  window.__HM_LEVELS = window.__HM_LEVELS || {};
  window.__HM_LEVELS[7] = {
    id: 7,
    key: 'siege-line',
    name: 'SIEGE LINE',
    tagline: 'BREAK THE NETWORK PIECE BY PIECE',
    briefing: [
      'FIVE SECTORS. ONE ROLLING OFFENSIVE.',
      'BREAK EACH BASE. KEEP MOVING.',
      'TAKE THE WARDEN LINE APART PIECE BY PIECE.'
    ],
    region: 'ember-drift',
    duration: 420,
    waves: [
      { at: 0, rate: 1.10, pack: 1, pool: ['drifter', 'cinder-kamikaze'] },
      { at: 30, rate: 0.96, pack: 1, pool: ['drifter', 'sprinter', 'cinder-kamikaze', 'ash-wraith'] },
      { at: 66, rate: 0.84, pack: 2, pool: ['sprinter', 'cinder-kamikaze', 'ash-wraith', 'ember-scarab'] },
      { at: 108, rate: 0.74, pack: 2, pool: ['cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'refracting-shard-drone'] },
      { at: 150, rate: 0.65, pack: 2, pool: ['sprinter', 'cinder-kamikaze', 'ember-scarab', 'refracting-shard-drone', 'glasswing-drone'] },
      { at: 198, rate: 0.57, pack: 3, pool: ['cinder-kamikaze', 'ash-wraith', 'ember-scarab', 'blink-stalker', 'gravity-mite', 'shard-larva'] },
      { at: 252, rate: 0.49, pack: 3, pool: ['sprinter', 'ember-scarab', 'refracting-shard-drone', 'glasswing-drone', 'blink-stalker', 'null-leech'] },
      { at: 312, rate: 0.43, pack: 4, pool: ['cinder-kamikaze', 'ash-wraith', 'refracting-shard-drone', 'glasswing-drone', 'blink-stalker', 'null-leech', 'derelict-guard-hulk'] },
      { at: 370, rate: 0.38, pack: 4, pool: ['cinder-kamikaze', 'ember-scarab', 'refracting-shard-drone', 'glasswing-drone', 'null-leech', 'derelict-guard-hulk', 'salvage-swarm', 'scrap-ripper'] }
    ],
    mods: { enemyHp: 1.2, spawnRate: 1.2 },
    bases: [
      { at: 30, type: 'hive', x: 3000, y: -900 },
      { at: 95, type: 'relay', x: 650, y: 1300 },
      { at: 160, type: 'bastion', x: -3000, y: -1100 },
      { at: 230, type: 'hive', x: 4800, y: 900 },
      { at: 300, type: 'bastion', x: -5200, y: -1300 }
    ],
    regionBosses: [
      { at: 150, region: 'ember-drift', x: 3000, y: -750, hpMul: 1.0 },
      { at: 330, region: 'crystal-shoals', x: 4800, y: 750, hpMul: 1.0 }
    ],
    finalBoss: null,
    objectives: [
      { id: 'survive-line', type: 'survive', label: 'HOLD THE LINE FOR 07:00' },
      { id: 'break-bases', type: 'bases', label: 'BREAK ALL FIVE BASES', count: 5 },
      { id: 'drop-lords', type: 'boss', label: 'DROP BOTH SWARM LORDS', count: 2 }
    ],
    stars: [
      { type: 'win', label: 'MISSION COMPLETE' },
      { type: 'time', under: 400, label: 'CLEAR BEFORE 06:40' },
      { type: 'kills', atLeast: 400, label: '400 KILLS // BREAK THE LINE' }
    ],
    events: [
      { at: 0, banner: ['SIEGE ORDER', 'TAKE THE NETWORK APART'] },
      { at: 60, callout: 'next sector: meridian verge. break the relay.' },
      { at: 100, grantBonus: 'arsenal' },
      { at: 125, callout: 'next sector: void rift. strip the bastion.' },
      { at: 140, heat: true },
      { at: 188, callout: 'next sector: crystal shoals. keep the assault moving.' },
      { at: 200, heat: false },
      { at: 255, callout: 'next sector: aurelion graveyard. crack the hulk.' },
      { at: 270, grantBonus: 'strike-wing' },
      { at: 320, heat: true },
      { at: 326, callout: 'next sector: ember drift. close the circle.' },
      { at: 385, heat: false }
    ],
    music: 'base'
  };
}());
