/* dungeon.js — eight hand-authored dungeon levels, each with a unique layout.
   Rooms are 16x11 grids (solid border, carved doors). Door types:
     'o' open   'l' locked (key)   's' shutter (slams open on room condition)
     'b' bombable shortcut (bomb)   'w' wall
   Room flags:
     dark:true        — room is pitch black until lit with the candle
     shutter:'clear'  — 's' doors open when all enemies in the room die
     shutter:'push'   — 's' doors open when the push block is shoved
     push:{c,r}       — pushable block location (implies a push secret)
     traps:true       — four classic corner blade traps are placed
   Every level: entry room exits down to the overworld; boss guards the LumenShard. */

const Dungeon = (() => {
  function room(doors, overlay = [], theme = 'dungeon', flags = {}) {
    const g = [];
    for (let y = 0; y < 11; y++) {
      const r = [];
      for (let x = 0; x < 16; x++)
        r.push((y === 0 || y === 10 || x === 0 || x === 15) ? '#' : 'F');
      g.push(r);
    }
    const door = (t) => t === 'l' ? 'L' : t === 's' ? 'Z' : t === 'b' ? 'Q' : 'F';
    if (doors.up && doors.up !== 'w')    { g[0][7] = door(doors.up); g[0][8] = door(doors.up); }
    if (doors.down && doors.down !== 'w'){ g[10][7] = door(doors.down); g[10][8] = door(doors.down); }
    if (doors.left && doors.left !== 'w'){ g[4][0]=door(doors.left); g[5][0]=door(doors.left); g[6][0]=door(doors.left); }
    if (doors.right && doors.right !== 'w'){ g[4][15]=door(doors.right); g[5][15]=door(doors.right); g[6][15]=door(doors.right); }
    if (flags.push) g[flags.push.r][flags.push.c] = 'p';
    for (const o of overlay) { const [y, x, ch] = o.split(','); g[+y][+x] = ch; }
    return Object.assign({ theme, rows: g.map(r => r.join('')), __doorDecl: doors }, flags);
  }

  // Shorthands for common decorations
  const PILLARS = ['3,4,B','3,11,B','7,4,B','7,11,B'];
  const CORNERS = ['2,2,B','2,13,B','8,2,B','8,13,B'];
  const LANE    = ['3,5,B','3,10,B','5,5,B','5,10,B','7,5,B','7,10,B'];
  const MOAT    = ['4,6,W','4,7,W','4,8,W','4,9,W','6,6,W','6,7,W','6,8,W','6,9,W'];

  // =========================================================================
  // LEVEL 1 — "THE HAWK" · 6 rooms, gentle intro. Item: boomerang.
  //        [1,0]     [2,0]boss
  //        [1,1]key  [2,1]hub   [3,1]item(shutter)
  //                  [2,2]entry
  const L1 = {
    id: 1, theme: 'dungeon', item: 'boomerang',
    entry: { col: 2, row: 2, pos: [7, 9] },
    rooms: {
      '2,2': { room: room({ up:'o' }, ['5,3,B','5,12,B'], 'dungeon'),
               enemies: [], exit: { down: true } },
      '2,1': { room: room({ up:'l', down:'o', left:'o', right:'s' }, PILLARS, 'dungeon', { shutter: 'clear' }),
               enemies: [['boneguard',null,5,4],['glimmerbat',null,10,6],['glimmerbat',null,8,3]] },
      '1,1': { room: room({ up:'o', right:'o' }, CORNERS, 'dungeon'),
               enemies: [['gel',null,5,4],['gel',null,10,5],['boneguard',null,8,7],['slimelet',null,6,7],['slimelet',null,9,7]],
               item: { kind: 'key', x: 8, y: 5 } },
      '3,1': { room: room({ left:'s' }, LANE, 'dungeon'),
               enemies: [['glimmerbat',null,4,4],['glimmerbat',null,11,3],['gel',null,8,6]],
               item: { kind: 'boomerang', x: 8, y: 5, guarded:true } },
      '1,0': { room: room({ down:'o' }, MOAT, 'dungeon'),
               enemies: [['reedripper','blue',7,5]],
               item: { kind: 'rupee5', x: 8, y: 5 } },
      '2,0': { room: room({ down:'l' }, [], 'dungeon'),
               enemies: [], boss: { variant: 'green', x: 11, y: 4 }, shard: { x: 7, y: 3 } },
      '0,1': { room: room({ right:'o' }, CORNERS, 'dungeon'),
               enemies: [['slimelet',null,5,4],['gel',null,10,6]],
               item: { kind: 'map', x: 8, y: 5, guarded:true } },
      '4,1': { room: room({ left:'o' }, PILLARS, 'dungeon'),
               enemies: [['slimelet',null,5,5],['glimmerbat',null,10,4]],
               item: { kind: 'compass', x: 8, y: 5, guarded:true } },
    },
  };

  // =========================================================================
  // LEVEL 2 — "THE MOON" · 7 rooms, a ring. Item: bow. Boss: EMBERBACK (bombs!).
  //   [1,0]key   [2,0]boss   [3,0]treasure
  //   [1,1]dark  [2,1]hub    [3,1]item
  //              [2,2]entry
  const L2 = {
    id: 2, theme: 'dungeon2', item: 'bow',
    entry: { col: 2, row: 2, pos: [7, 9] },
    rooms: {
      '2,2': { room: room({ up:'o' }, ['5,3,B','5,12,B','3,7,B','3,8,B'], 'dungeon2'),
               enemies: [['gel',null,4,3],['gel',null,11,3]], exit: { down: true } },
      '2,1': { room: room({ up:'l', down:'o', left:'o', right:'o' }, [], 'dungeon2'),
               enemies: [['boneguard',null,5,4],['boneguard',null,10,5],['glimmerbat',null,8,7]],
               item: { kind: 'map', x: 8, y: 7, guarded:true } },
      '1,1': { room: room({ up:'o', right:'o' }, LANE, 'dungeon2', { dark: true }),
               enemies: [['glimmerbat',null,4,4],['glimmerbat',null,8,3],['glimmerbat',null,11,6]],
               item: { kind: 'key', x: 3, y: 7, guarded:true } },
      '3,1': { room: room({ up:'o', left:'o' }, CORNERS, 'dungeon2'),
               enemies: [['mossbrute','blue',4,4],['boneguard',null,11,4],['slimelet',null,6,7],['slimelet',null,9,7]],
               item: { kind: 'bow', x: 8, y: 5, guarded:true } },
      '1,0': { room: room({ down:'o', right:'s' }, PILLARS, 'dungeon2', { shutter: 'clear' }),
               enemies: [['boneguard',null,5,4],['boneguard',null,10,4],['gel',null,8,6]],
               item: { kind: 'key', x: 12, y: 3, guarded:true } },
      '3,0': { room: room({ down:'o' }, MOAT, 'dungeon2'),
               enemies: [['glimmerbat',null,6,3],['glimmerbat',null,9,3],['rushcoil',null,8,7]],
               item: { kind: 'compass', x: 8, y: 5, guarded:true } },
      '2,0': { room: room({ down:'l', left:'s' }, ['2,3,B','2,12,B'], 'dungeon2', { shutter: 'clear' }),
               enemies: [], boss: { variant: 'emberback', x: 10, y: 4 }, shard: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 3 — "THE SPIRAL" · 7 rooms, push-block gate. Item: heart container.
  // Boss: THORNCROWN.
  //   [1,0]key(dark) [2,0]boss   [3,0]treasure
  //   [1,1]push      [2,1]hub    [3,1]item
  //                  [2,2]entry
  const L3 = {
    id: 3, theme: 'dungeon', item: 'heartcontainer',
    entry: { col: 2, row: 2, pos: [7, 9] },
    rooms: {
      '2,2': { room: room({ up:'o' }, ['5,4,B','5,11,B'], 'dungeon'),
               enemies: [['gel',null,4,3],['gel',null,11,3]], exit: { down: true } },
      '2,1': { room: room({ up:'l', down:'o', left:'o', right:'o' }, MOAT, 'dungeon'),
               enemies: [['cinderhorn',null,5,3],['glimmerbat',null,10,7]] },
      '1,1': { room: room({ right:'o', up:'s' }, ['3,3,B','3,12,B','7,3,B','7,12,B'], 'dungeon',
                          { shutter: 'push', push: { c: 7, r: 5 } }),
               enemies: [['boneguard',null,4,4],['boneguard',null,11,4]] },
      '1,0': { room: room({ down:'s' }, LANE, 'dungeon', { dark: true }),
               enemies: [['glimmerbat',null,5,4],['glimmerbat',null,10,4]],
               item: { kind: 'key', x: 8, y: 3, guarded:true } },
      '3,1': { room: room({ left:'o', up:'o' }, CORNERS, 'dungeon'),
               enemies: [['cinderhorn',null,5,5],['gel',null,10,3],['gel',null,8,7],['rushcoil',null,6,3]],
               item: { kind: 'heartcontainer', x: 8, y: 5, guarded:true } },
      '3,0': { room: room({ down:'o' }, PILLARS, 'dungeon'),
               enemies: [['boneguard',null,5,4],['boneguard',null,10,5],['rushcoil',null,8,7]],
               item: { kind: 'rupee5', x: 8, y: 4 } },
      '0,1': { room: room({ right:'o' }, CORNERS, 'dungeon'),
               enemies: [['slimelet',null,5,4],['rushcoil',null,10,6]],
               item: { kind: 'map', x: 8, y: 5, guarded:true } },
      '4,1': { room: room({ left:'o', up:'o' }, LANE, 'dungeon'),
               enemies: [['rushcoil',null,5,4],['slimelet',null,10,6]],
               item: { kind: 'compass', x: 8, y: 5, guarded:true } },
      '4,0': { room: room({ down:'o' }, PILLARS, 'dungeon'),
               enemies: [['boneguard',null,6,4],['rushcoil',null,10,6]] },
      '2,0': { room: room({ down:'l' }, [], 'dungeon'),
               enemies: [], boss: { variant: 'thorncrown', x: 7, y: 4, bossOpts: { headHp: 2 } },
               shard: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 4 — "THE SERPENT" · 8 rooms, a winding S. Item: stepladder. Boss: Manymaw.
  //   [1,0]boss  [2,0]       [3,0]key(dark)
  //   [1,1]      [2,1]moat   [3,1]
  //              [2,2]entry  [3,2]item
  const L4 = {
    id: 4, theme: 'dungeon2', item: 'stepladder',
    entry: { col: 2, row: 2, pos: [7, 9] },
    rooms: {
      '2,2': { room: room({ up:'w', right:'o' }, [], 'dungeon2'),
               enemies: [['boomerkin','brown',5,5],['boomerkin','brown',10,5]], exit: { down: true } },
      '3,2': { room: room({ left:'o', up:'o' }, LANE, 'dungeon2', { traps:true }),
               enemies: [['nightwarden',null,5,4],['glimmerbat',null,10,6],['emberorb',null,8,7]],
               item: { kind: 'stepladder', x: 8, y: 5, guarded:true } },
      '3,1': { room: room({ down:'o', up:'o' }, MOAT, 'dungeon2'),
               enemies: [['reedripper','blue',7,5],['glimmerbat',null,4,3]] },
      '3,0': { room: room({ down:'o', left:'o' }, CORNERS, 'dungeon2', { dark: true }),
               enemies: [['veilcaster',null,6,4],['glimmerbat',null,10,6]],
               item: { kind: 'key', x: 8, y: 5, guarded:true } },
      '2,0': { room: room({ right:'o', down:'o' }, PILLARS, 'dungeon2', { traps:true }),
               enemies: [['nightwarden',null,5,4],['nightwarden',null,10,5]] },
      '2,1': { room: room({ up:'o', left:'l' },
                          ['4,4,W','4,5,W','5,4,W','5,5,W','4,10,W','4,11,W','5,10,W','5,11,W'], 'dungeon2', { traps:true }),
               enemies: [['ironwarden',null,7,7]],
               item: { kind: 'bomb', x: 2, y: 2 } },
      '1,1': { room: room({ right:'l', up:'s', left:'b' }, ['7,4,B','7,11,B'], 'dungeon2', { shutter: 'clear', miniboss:true }),
               enemies: [['nightwarden',null,5,4],['boomerkin','blue',10,4],['glimmerbat',null,8,7],['coilwyrm',null,6,6],['emberback',null,10,6],['emberback',null,11,3]],
               item: { kind: 'map', x: 8, y: 5, guarded:true } },
      '0,1': { room: room({ right:'b' }, CORNERS, 'dungeon2'),
               enemies: [['emberorb',null,8,6]], item: { kind: 'compass', x: 8, y: 5, guarded:true } },
      '1,0': { room: room({ down:'s' }, [], 'dungeon2'),
               enemies: [], boss: { variant: 'manymaw', x: 11, y: 4, bossOpts: { headHp: 3, heads: 2 } },
               shard: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 5 — "THE LIZARD" · 7 rooms. Item: whistle. Boss: RED EMBERBACK (3 bombs).
  //   [0,0]item(push) [1,0]dark    [2,0]boss
  //   [0,1]key        [1,1]hub     [2,1]bombs
  //                   [1,2]entry
  const L5 = {
    id: 5, theme: 'dungeon', item: 'whistle',
    entry: { col: 1, row: 2, pos: [7, 9] },
    rooms: {
      '1,2': { room: room({ up:'o' }, ['3,4,B','3,11,B'], 'dungeon'),
               enemies: [['boomerkin','blue',5,5],['boomerkin','blue',10,5]], exit: { down: true } },
      '1,1': { room: room({ up:'o', down:'o', left:'o', right:'o' }, MOAT, 'dungeon', { shutter:'clear', miniboss:true }),
               enemies: [['veilcaster',null,5,3],['ironwarden',null,10,7],['griphand',null,8,3],['emberorb',null,3,3],['coilwyrm',null,4,3],['emberback',null,10,3],['emberback',null,11,7]],
               item: { kind: 'map', x: 4, y: 4, guarded:true } },
      '0,1': { room: room({ right:'o', up:'o' }, LANE, 'dungeon'),
               enemies: [['nightwarden',null,5,4],['nightwarden',null,9,5],['gel',null,8,3]],
               item: { kind: 'key', x: 8, y: 7, guarded:true } },
      '0,0': { room: room({ down:'o', right:'s' }, CORNERS, 'dungeon',
                          { shutter: 'push', push: { c: 8, r: 5 } }),
               enemies: [['veilcaster',null,4,4],['glimmerbat',null,11,6]],
               item: { kind: 'whistle', x: 12, y: 7, guarded:true } },
      '1,0': { room: room({ left:'s', down:'o', right:'l' }, [], 'dungeon', { dark: true }),
               enemies: [['ironwarden',null,5,4],['nightwarden',null,10,5],['glimmerbat',null,8,3]],
               item: { kind: 'rupee5', x: 8, y: 5 } },
      '2,1': { room: room({ up:'o', left:'o' }, PILLARS, 'dungeon', { traps:true }),
               enemies: [['mireleecher',null,5,4],['boomerkin','brown',10,5],['emberorb',null,8,7]],
               item: { kind: 'compass', x: 8, y: 5, guarded:true } },
      '2,0': { room: room({ down:'o', left:'l' }, ['2,3,B','2,12,B','8,3,B','8,12,B'], 'dungeon'),
               enemies: [], boss: { variant: 'emberback', x: 10, y: 4, bossOpts: { pair: true } },
               shard: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 6 — "THE DRAKE" · 9 rooms, long gauntlet. Item: magic key. Boss: THORNCROWN+.
  //   [0,0]      [1,0]       [2,0]boss
  //   [0,1]dark  [1,1]push   [2,1]moat
  //   [0,2]      [1,2]entry  [2,2]item
  const L6 = {
    id: 6, theme: 'dungeon2', item: 'magickey',
    entry: { col: 1, row: 2, pos: [7, 9] },
    rooms: {
      '1,2': { room: room({ up:'l', left:'o', right:'o' }, [], 'dungeon2'),
               enemies: [['ironwarden',null,5,5],['ironwarden',null,10,5]], exit: { down: true } },
      '2,2': { room: room({ left:'o', up:'s' }, LANE, 'dungeon2', { shutter: 'clear' }),
               enemies: [['veilcaster',null,5,4],['nightwarden',null,9,5],['glimmerbat',null,8,3],['emberorb',null,6,7]],
               item: { kind: 'bomb', x: 8, y: 5 } },
      '0,2': { room: room({ right:'o', up:'s' }, CORNERS, 'dungeon2', { shutter:'clear', traps:true }),
               enemies: [['mireleecher',null,5,4],['boomerkin','blue',10,4]],
               item: { kind: 'key', x: 3, y: 3, guarded:true } },
      '0,1': { room: room({ down:'o', up:'o' }, MOAT, 'dungeon2', { dark: true }),
               enemies: [['veilcaster',null,7,3],['glimmerbat',null,4,6],['glimmerbat',null,11,6]] },
      '0,0': { room: room({ down:'o', right:'s' }, PILLARS, 'dungeon2', { dark:true }),
               enemies: [['nightwarden',null,5,4],['nightwarden',null,10,5],['veilcaster',null,8,7]],
               item: { kind: 'magickey', x: 8, y: 3, guarded:true } },
      '1,0': { room: room({ left:'s', right:'s', down:'o' }, ['5,7,B','5,8,B'], 'dungeon2', { shutter: 'clear', dark:true, miniboss:true }),
               enemies: [['cinderhorn',null,5,4],['ironwarden',null,10,6],['gel',null,8,3],['coilwyrm',null,6,6],['emberback',null,10,6],['emberback',null,11,3]],
               item: { kind:'map', x:8, y:3, guarded:true } },
      '1,1': { room: room({ up:'o', down:'l', right:'o' }, ['3,3,B','3,12,B','7,3,B','7,12,B'], 'dungeon2',
                          { shutter: 'push', push: { c: 7, r: 5 } }),
               enemies: [['nightwarden',null,4,4],['boomerkin','blue',11,4]] },
      '2,1': { room: room({ left:'o', up:'o', down:'s' }, MOAT, 'dungeon2', { traps:true }),
               enemies: [['reedripper','blue',7,5],['veilcaster',null,10,3]],
               item: { kind: 'bomb', x: 2, y: 8 } },
      '3,1': { room: room({ left:'b' }, CORNERS, 'dungeon2'),
               enemies: [['emberorb',null,8,6]], item: { kind:'compass', x:8, y:5, guarded:true } },
      '2,0': { room: room({ down:'o', left:'s' }, [], 'dungeon2'),
               enemies: [], boss: { variant: 'mireeye', x: 7, y: 4 },
               shard: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 7 — "THE WRAITH" · horned silhouette. Item: heart container. Boss: BURROWER.
  //   [1,0]key(dark) [2,0]boss  [3,0]item
  //   [1,1]moat      [2,1]hub   [3,1]push
  //                  [2,2]entry
  const L7 = {
    id: 7, theme: 'dungeon', item: 'heartcontainer',
    entry: { col: 2, row: 2, pos: [7, 9] },
    rooms: {
      '2,2': { room: room({ up:'o' }, ['5,4,B','5,11,B','3,7,W','3,8,W'], 'dungeon'),
               enemies: [['nightwarden',null,5,5],['nightwarden',null,10,5]], exit: { down: true } },
      '2,1': { room: room({ up:'l', down:'o', left:'o', right:'o' }, PILLARS, 'dungeon'),
               enemies: [['veilcaster',null,5,4],['cinderhorn',null,10,6],['ironwarden',null,8,7],['griphand',null,6,3]] },
      '1,1': { room: room({ right:'o', up:'o' }, MOAT, 'dungeon'),
               enemies: [['reedripper','blue',7,5],['cinderhorn',null,4,7]] },
      '1,0': { room: room({ down:'o' }, LANE, 'dungeon', { dark: true }),
               enemies: [['veilcaster',null,5,4],['veilcaster',null,10,4]],
               item: { kind: 'key', x: 8, y: 5, guarded:true } },
      '3,1': { room: room({ left:'o', up:'s', down:'o', right:'o' }, CORNERS, 'dungeon',
                          { shutter: 'push', push: { c: 8, r: 7 } }),
               enemies: [['nightwarden',null,5,4],['ironwarden',null,10,5]] },
      '3,0': { room: room({ down:'s' }, ['5,7,B','5,8,B'], 'dungeon'),
               enemies: [['mireleecher',null,5,4],['boomerkin','blue',10,4]],
               item: { kind: 'heartcontainer', x: 6, y: 5, guarded:true } },
      '2,0': { room: room({ down:'l', right:'s' }, [], 'dungeon', { shutter:'clear', miniboss:true }),
               enemies: [['veilcaster',null,3,7],['veilcaster',null,12,7],['coilwyrm',null,6,6],['emberback',null,10,6],['emberback',null,11,3]],
               item: { kind:'map', x:8, y:5, guarded:true } },
      '4,1': { room: room({ left:'o', up:'o' }, LANE, 'dungeon'),
               enemies: [['nightwarden',null,5,4],['emberorb',null,10,6]],
               item: { kind:'magicalboomerang', x:8, y:5, guarded:true } },
      '4,0': { room: room({ down:'o' }, [], 'dungeon'),
               enemies: [], boss: { variant:'burrower', x:8, y:4 }, shard: { x:7, y:3 } },
      '3,2': { room: room({ up:'o' }, ['5,7,B'], 'dungeon', { boomerkinGate:true }),
               enemies: [['emberorb',null,8,3]],
               item: { kind:'compass', x:8, y:5, guarded:true } },
    },
  };

  // =========================================================================
  // LEVEL 8 — "THE CROWN" · 9 rooms, the gauntlet. Item: heart container. Boss: MANYMAW-3.
  //   [0,0]moat  [1,0]boss   [2,0]key(dark,shutter)
  //   [0,1]dark  [1,1]       [2,1]water maze
  //   [0,2]push  [1,2]entry  [2,2]bombs
  const L8 = {
    id: 8, theme: 'dungeon2', item: 'heartcontainer',
    entry: { col: 1, row: 2, pos: [7, 9] },
    rooms: {
      '1,2': { room: room({ up:'l', left:'o', right:'o' }, [], 'dungeon2'),
               enemies: [['ironwarden',null,5,5],['ironwarden',null,10,5]], exit: { down: true } },
      '0,2': { room: room({ right:'o', up:'s' }, CORNERS, 'dungeon2',
                          { shutter: 'push', push: { c: 7, r: 5 } }),
               enemies: [['nightwarden',null,5,4],['cinderhorn',null,10,4]] },
      '0,1': { room: room({ down:'s', up:'o', right:'o' }, LANE, 'dungeon2', { dark: true }),
               enemies: [['veilcaster',null,5,4],['veilcaster',null,10,4],['glimmerbat',null,8,7]],
               item: { kind: 'key', x: 8, y: 5, guarded:true } },
      '0,0': { room: room({ down:'o' }, MOAT, 'dungeon2'),
               enemies: [['reedripper','blue',7,5],['cinderhorn',null,4,7],['glimmerbat',null,11,3]] },
      '2,2': { room: room({ left:'o', up:'o', right:'b' }, PILLARS, 'dungeon2'),
               enemies: [['boomerkin','blue',5,4],['nightwarden',null,10,5]],
               item: { kind: 'heartcontainer', x: 8, y: 3, guarded:true } },
      '2,1': { room: room({ down:'o', up:'o' }, ['4,4,W','4,5,W','4,10,W','4,11,W','6,4,W','6,5,W','6,10,W','6,11,W'], 'dungeon2', { traps:true }),
               enemies: [['ironwarden',null,7,5],['veilcaster',null,3,3],['griphand',null,8,3],['emberorb',null,6,7]] },
      '2,0': { room: room({ down:'o', left:'s' }, [], 'dungeon2', { dark: true, shutter: 'clear', miniboss:true, traps:true }),
               enemies: [['nightwarden',null,5,4],['nightwarden',null,10,4],['cinderhorn',null,8,7],['coilwyrm',null,6,6],['emberback',null,10,6],['emberback',null,11,3]],
               item: { kind: 'map', x: 8, y: 5, guarded:true } },
      '3,2': { room: room({ left:'b' }, CORNERS, 'dungeon2'),
               enemies: [['emberorb',null,8,6]], item: { kind:'compass', x:8, y:5, guarded:true } },
      '1,1': { room: room({ down:'o', up:'l', left:'o' }, ['3,3,B','3,12,B','7,3,B','7,12,B'], 'dungeon2'),
               enemies: [['cinderhorn',null,5,4],['ironwarden',null,10,6],['veilcaster',null,8,3]] },
      '1,0': { room: room({ down:'l', right:'s' }, [], 'dungeon2'),
               enemies: [], boss: { variant: 'manymaw', x: 11, y: 4, bossOpts: { headHp: 4, heads: 4, extraFireballs: 2 } },
               shard: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 9 — "SABLE'S CROWN" · the post-shard finale.  This level is
  // deliberately registered out-of-band: the eight LumenShard dungeons remain
  // the canonical LEVELS/count set, while level(9) exposes this final gauntlet.
  //
  //                    [silver]--s--[SABLE]--s--[ELOWEN]
  //                       |             |
  // [dark compass]--o--[locked spine]   |
  //                       |             |
  //                    [locked gate]    |
  //                       |             |
  // [key]--b--[wing]--[hub]--[push]--s--[map]--b--[dead end]
  //                              |
  //                           [HALOSWARM]
  const L9 = {
    id: 9, name: "SABLE'S CROWN", theme: 'dungeon2',
    entry: { col: 2, row: 4, pos: [7, 9] },
    rooms: {
      '2,4': { room: room({ up:'o' }, ['5,3,B','5,12,B'], 'dungeon2'),
               enemies: [['nightwarden',null,5,4],['boneguard',null,10,6]], exit: { down:true } },
      '2,3': { room: room({ up:'l', down:'o', left:'o', right:'o' }, MOAT, 'dungeon2'),
               enemies: [['ironwarden',null,5,4],['veilcaster',null,10,5],['griphand',null,8,3]] },
      '1,3': { room: room({ right:'o', left:'b' }, CORNERS, 'dungeon2'),
               enemies: [['nightwarden',null,5,4],['cinderhorn',null,10,6],['slimelet',null,8,3]] },
      '0,3': { room: room({ right:'b' }, LANE, 'dungeon2'),
               enemies: [['ironwarden',null,7,4],['emberorb',null,8,6]],
               item: { kind:'key', x:8, y:5 } },
      '3,3': { room: room({ left:'o', up:'o', right:'s' }, PILLARS, 'dungeon2',
                           { shutter:'push', push:{ c:7, r:5 } }),
               enemies: [['nightwarden',null,5,4],['ironwarden',null,10,6],['slimelet',null,8,3]] },
      '4,3': { room: room({ left:'s', up:'b' }, LANE, 'dungeon2', { dark:true }),
               enemies: [['veilcaster',null,5,4],['cinderhorn',null,10,6],['griphand',null,8,3]],
               item: { kind:'map', x:8, y:5, guarded:true } },
      '4,2': { room: room({ down:'b' }, CORNERS, 'dungeon2', { traps:true }),
               enemies: [['emberorb',null,8,5]] },
      '3,2': { room: room({ down:'o', left:'s' }, MOAT, 'dungeon2',
                           { shutter:'clear', miniboss:true }),
               enemies: [['haloswarm',null,8,4]],
               item: { kind:'redring', x:8, y:5, guarded:true } },
      '2,2': { room: room({ down:'l', up:'l', left:'o', right:'s' }, PILLARS, 'dungeon2'),
               enemies: [['nightwarden',null,5,4],['veilcaster',null,10,6]],
               item: { kind:'key', x:8, y:5, guarded:true, requiresClear:'3,2' } },
      '1,2': { room: room({ right:'o' }, LANE, 'dungeon2', { dark:true }),
               enemies: [['veilcaster',null,5,4],['nightwarden',null,10,6],['slimelet',null,8,3]],
               item: { kind:'compass', x:8, y:5, guarded:true } },
      '2,1': { room: room({ down:'l', up:'o' }, CORNERS, 'dungeon2'),
               enemies: [['ironwarden',null,5,4],['cinderhorn',null,10,6],['griphand',null,8,3]],
               item: { kind:'rupee5', x:8, y:5 } },
      '2,0': { room: room({ down:'o', right:'s' }, PILLARS, 'dungeon2', { shutter:'clear' }),
               enemies: [['veilcaster',null,5,4],['nightwarden',null,10,6],['slimelet',null,8,3]],
               item: { kind:'silverarrows', x:8, y:5, guarded:true } },
      '3,0': { room: room({ left:'s', up:'s' }, [], 'dungeon2', { shutter:'sable' }),
               enemies: [], boss: { variant:'sable', x:10, y:4 } },
      '3,-1': { room: room({ down:'s' }, [], 'dungeon2'),
                item: { kind:'elowen', x:8, y:5, permanent:true } },
    },
  };

  function edgeOrder(a, b) {
    const [ac, ar] = a.split(',').map(Number), [bc, br] = b.split(',').map(Number);
    return ar < br || (ar === br && ac <= bc) ? [a, b] : [b, a];
  }
  function edgeId(lvl, a, b) {
    const [na, nb] = edgeOrder(a, b);
    return lvl.id + ':' + na + '|' + nb;
  }
  function sideCells(side) {
    if (side === 'up') return [[7, 0], [8, 0]];
    if (side === 'down') return [[7, 10], [8, 10]];
    if (side === 'left') return [[0, 4], [0, 5], [0, 6]];
    return [[15, 4], [15, 5], [15, 6]];
  }
  function neighbor(col, row, side) {
    if (side === 'up') return [col, row - 1];
    if (side === 'down') return [col, row + 1];
    if (side === 'left') return [col - 1, row];
    return [col + 1, row];
  }
  function sideBetween(a, b) {
    const [ac, ar] = a.split(',').map(Number), [bc, br] = b.split(',').map(Number);
    if (bc === ac && br === ar - 1) return 'up';
    if (bc === ac && br === ar + 1) return 'down';
    if (bc === ac - 1 && br === ar) return 'left';
    return 'right';
  }
  function edgeType(t) { return t === 'l' ? 'locked' : t === 's' ? 'shutter' : t === 'b' ? 'bomb' : 'open'; }
  function edgePriority(type) { return type === 'locked' ? 4 : type === 'shutter' ? 3 : type === 'bomb' ? 2 : 1; }
  function doorChar(type) { return type === 'locked' ? 'L' : type === 'shutter' ? 'Z' : type === 'bomb' ? 'Q' : 'F'; }

  function rebuildRoomDoors(lvl, key, rd) {
    const g = rd.room.rows.map(s => s.split(''));
    for (const side of ['up', 'down', 'left', 'right']) {
      for (const [c, r] of sideCells(side)) g[r][c] = '#';
    }
    for (const edge of lvl.edges) {
      let side = null;
      if (edge.a === key) side = sideBetween(edge.a, edge.b);
      else if (edge.b === key) side = sideBetween(edge.b, edge.a);
      if (!side) continue;
      const ch = doorChar(edge.type);
      for (const [c, r] of sideCells(side)) g[r][c] = ch;
    }
    rd.room.rows = g.map(r => r.join(''));
  }

  function finalizeLevel(lvl) {
    const found = {};
    for (const key in lvl.rooms) {
      const rd = lvl.rooms[key], [col, row] = key.split(',').map(Number);
      const decl = rd.room.__doorDecl || {};
      for (const side of ['up', 'down', 'left', 'right']) {
        const t = decl[side];
        if (!t || t === 'w') continue;
        const [nc, nr] = neighbor(col, row, side), other = nc + ',' + nr;
        if (!lvl.rooms[other]) continue;          // preserve the existing wall-side mismatch
        const id = edgeId(lvl, key, other);
        const type = edgeType(t);
        if (!found[id]) found[id] = { id, a: edgeOrder(key, other)[0], b: edgeOrder(key, other)[1], type, declarations:[type] };
        else { found[id].declarations.push(type); if (edgePriority(type) > edgePriority(found[id].type)) found[id].type = type; }
      }
    }
    lvl.edges = Object.values(found);
    for (const edge of lvl.edges) {
      if (new Set(edge.declarations).size > 1) edge.type = 'open';
      delete edge.declarations;
    }
    for (const edge of lvl.edges) {
      if (edge.type !== 'shutter') continue;
      const rooms = [lvl.rooms[edge.a], lvl.rooms[edge.b]];
      const conditionRoom = [edge.a, edge.b].find((k, i) => rooms[i].room.shutter);
      if (conditionRoom) {
        edge.condition = { room: conditionRoom, kind: rooms[[edge.a, edge.b].indexOf(conditionRoom)].room.shutter };
      }
      // These two declarations were rendered as permanently closed shutters.
      if (lvl.id === 3 && edge.a === '1,0' && edge.b === '1,1') edge.condition = { room:'1,1', kind:'push' };
      if (lvl.id === 7 && edge.a === '3,0' && edge.b === '3,1') edge.condition = { room:'3,1', kind:'push' };
    }
    for (const key in lvl.rooms) {
      rebuildRoomDoors(lvl, key, lvl.rooms[key]);
      delete lvl.rooms[key].room.__doorDecl;
    }
    return lvl;
  }

  const LEVELS = { 1: L1, 2: L2, 3: L3, 4: L4, 5: L5, 6: L6, 7: L7, 8: L8 };
  const NAMES = {1:'HAWK',2:'MOON',3:'SPIRAL',4:'SERPENT',5:'LIZARD',6:'DRAKE',7:'WRAITH',8:'CROWN'};
  for (const id in LEVELS) LEVELS[id].name = NAMES[id];
  Object.values(LEVELS).forEach(finalizeLevel);
  finalizeLevel(L9);

  function level(n) { return LEVELS[n] || (n === 9 ? L9 : LEVELS[1]); }
  function getRoom(lvl, col, row) { return lvl.rooms[col + ',' + row] || null; }
  function edgeForDoorTile(value) {
    const m = /^(\d+):(-?\d+),(-?\d+):(-?\d+),(-?\d+)$/.exec(String(value));
    if (!m) return null;
    const lvl = level(+m[1]), key = m[2] + ',' + m[3], c = +m[4], r = +m[5];
    for (const edge of lvl.edges || []) {
      if (edge.a !== key && edge.b !== key) continue;
      const side = edge.a === key ? sideBetween(edge.a, edge.b) : sideBetween(edge.b, edge.a);
      if (sideCells(side).some(([x, y]) => x === c && y === r)) return edge.id;
    }
    return null;
  }
  function doorTiles(edge, roomKey) {
    let side = null;
    if (edge.a === roomKey) side = sideBetween(edge.a, edge.b);
    else if (edge.b === roomKey) side = sideBetween(edge.b, edge.a);
    return side ? sideCells(side) : [];
  }

  // Minimap bounds — layouts vary per level
  function bounds(lvl) {
    let minC = 99, maxC = -99, minR = 99, maxR = -99;
    for (const k in lvl.rooms) {
      const [c, r] = k.split(',').map(Number);
      if (c < minC) minC = c; if (c > maxC) maxC = c;
      if (r < minR) minR = r; if (r > maxR) maxR = r;
    }
    return { minC, maxC, minR, maxR };
  }

  return { level, getRoom, bounds, edgeForDoorTile, doorTiles, count: Object.keys(LEVELS).length, names: NAMES };
})();
