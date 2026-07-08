/* dungeon.js — eight hand-authored dungeon levels, each with a unique layout.
   Rooms are 16x11 grids (solid border, carved doors). Door types:
     'o' open   'l' locked (key)   's' shutter (slams open on room condition)   'w' wall
   Room flags:
     dark:true        — room is pitch black until lit with the candle
     shutter:'clear'  — 's' doors open when all enemies in the room die
     shutter:'push'   — 's' doors open when the push block is shoved
     push:{c,r}       — pushable block location (implies a push secret)
   Every level: entry room exits down to the overworld; boss guards the Triforce. */

const Dungeon = (() => {
  function room(doors, overlay = [], theme = 'dungeon', flags = {}) {
    const g = [];
    for (let y = 0; y < 11; y++) {
      const r = [];
      for (let x = 0; x < 16; x++)
        r.push((y === 0 || y === 10 || x === 0 || x === 15) ? '#' : 'F');
      g.push(r);
    }
    const door = (t) => t === 'l' ? 'L' : t === 's' ? 'Z' : 'F';
    if (doors.up && doors.up !== 'w')    { g[0][7] = door(doors.up); g[0][8] = door(doors.up); }
    if (doors.down && doors.down !== 'w'){ g[10][7] = door(doors.down); g[10][8] = door(doors.down); }
    if (doors.left && doors.left !== 'w'){ g[4][0]=door(doors.left); g[5][0]=door(doors.left); g[6][0]=door(doors.left); }
    if (doors.right && doors.right !== 'w'){ g[4][15]=door(doors.right); g[5][15]=door(doors.right); g[6][15]=door(doors.right); }
    if (flags.push) g[flags.push.r][flags.push.c] = 'p';
    for (const o of overlay) { const [y, x, ch] = o.split(','); g[+y][+x] = ch; }
    return Object.assign({ theme, rows: g.map(r => r.join('')), doors }, flags);
  }

  // Shorthands for common decorations
  const PILLARS = ['3,4,B','3,11,B','7,4,B','7,11,B'];
  const CORNERS = ['2,2,B','2,13,B','8,2,B','8,13,B'];
  const LANE    = ['3,5,B','3,10,B','5,5,B','5,10,B','7,5,B','7,10,B'];
  const MOAT    = ['4,6,W','4,7,W','4,8,W','4,9,W','6,6,W','6,7,W','6,8,W','6,9,W'];

  // =========================================================================
  // LEVEL 1 — "THE EAGLE" · 6 rooms, gentle intro. Item: boomerang.
  //        [1,0]     [2,0]boss
  //        [1,1]key  [2,1]hub   [3,1]item(shutter)
  //                  [2,2]entry
  const L1 = {
    id: 1, theme: 'dungeon', item: 'boomerang',
    entry: { col: 2, row: 2, pos: [7, 9] },
    rooms: {
      '2,2': { room: room({ up:'o' }, ['5,3,B','5,12,B'], 'dungeon'),
               enemies: [], exit: { down: true } },
      '2,1': { room: room({ up:'l', down:'o', left:'o', right:'o' }, PILLARS, 'dungeon'),
               enemies: [['stalfos',null,5,4],['keese',null,10,6],['keese',null,8,3]] },
      '1,1': { room: room({ up:'o', right:'o' }, CORNERS, 'dungeon'),
               enemies: [['gel',null,5,4],['gel',null,10,5],['stalfos',null,8,7]],
               item: { kind: 'key', x: 8, y: 5 } },
      '3,1': { room: room({ left:'s' }, LANE, 'dungeon', { shutter: 'clear' }),
               enemies: [['keese',null,4,4],['keese',null,11,3],['gel',null,8,6]],
               item: { kind: 'boomerang', x: 8, y: 5 } },
      '1,0': { room: room({ down:'o' }, MOAT, 'dungeon'),
               enemies: [['zola','blue',7,5]],
               item: { kind: 'rupee5', x: 8, y: 5 } },
      '2,0': { room: room({ down:'l' }, [], 'dungeon'),
               enemies: [], boss: { variant: 'green', x: 11, y: 4 }, triforce: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 2 — "THE MOON" · 7 rooms, a ring. Item: bow. Boss: DODONGO (bombs!).
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
               enemies: [['stalfos',null,5,4],['stalfos',null,10,5],['keese',null,8,7]],
               item: { kind: 'bomb', x: 8, y: 7 } },
      '1,1': { room: room({ up:'o', right:'o' }, LANE, 'dungeon2', { dark: true }),
               enemies: [['keese',null,4,4],['keese',null,8,3],['keese',null,11,6]],
               item: { kind: 'key', x: 3, y: 7 } },
      '3,1': { room: room({ up:'o', left:'o' }, CORNERS, 'dungeon2'),
               enemies: [['moblin','blue',4,4],['stalfos',null,11,4]],
               item: { kind: 'bow', x: 8, y: 5 } },
      '1,0': { room: room({ down:'o', right:'s' }, PILLARS, 'dungeon2', { shutter: 'clear' }),
               enemies: [['stalfos',null,5,4],['stalfos',null,10,4],['gel',null,8,6]],
               item: { kind: 'key', x: 12, y: 3 } },
      '3,0': { room: room({ down:'o' }, MOAT, 'dungeon2'),
               enemies: [['keese',null,6,3],['keese',null,9,3]],
               item: { kind: 'rupee5', x: 8, y: 5 } },
      '2,0': { room: room({ down:'l', left:'s' }, ['2,3,B','2,12,B'], 'dungeon2', { shutter: 'clear' }),
               enemies: [], boss: { variant: 'dodongo', x: 10, y: 4 }, triforce: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 3 — "THE MANJI" · 7 rooms, push-block gate. Item: heart container.
  // Boss: MANHANDLA.
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
               enemies: [['lynel',null,5,3],['keese',null,10,7]] },
      '1,1': { room: room({ right:'o', up:'s' }, ['3,3,B','3,12,B','7,3,B','7,12,B'], 'dungeon',
                          { shutter: 'push', push: { c: 7, r: 5 } }),
               enemies: [['stalfos',null,4,4],['stalfos',null,11,4]] },
      '1,0': { room: room({ down:'s' }, LANE, 'dungeon', { dark: true }),
               enemies: [['keese',null,5,4],['keese',null,10,4]],
               item: { kind: 'key', x: 8, y: 3 } },
      '3,1': { room: room({ left:'o', up:'o' }, CORNERS, 'dungeon'),
               enemies: [['lynel',null,5,5],['gel',null,10,3],['gel',null,8,7]],
               item: { kind: 'heartcontainer', x: 8, y: 5 } },
      '3,0': { room: room({ down:'o' }, PILLARS, 'dungeon'),
               enemies: [['stalfos',null,5,4],['stalfos',null,10,5]],
               item: { kind: 'rupee5', x: 8, y: 4 } },
      '2,0': { room: room({ down:'l' }, [], 'dungeon'),
               enemies: [], boss: { variant: 'manhandla', x: 7, y: 4, bossOpts: { headHp: 2 } },
               triforce: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 4 — "THE SNAKE" · 8 rooms, a winding S. Item: stepladder. Boss: Gleeok.
  //   [1,0]boss  [2,0]       [3,0]key(dark)
  //   [1,1]      [2,1]moat   [3,1]
  //              [2,2]entry  [3,2]item
  const L4 = {
    id: 4, theme: 'dungeon2', item: 'stepladder',
    entry: { col: 2, row: 2, pos: [7, 9] },
    rooms: {
      '2,2': { room: room({ up:'w', right:'o' }, [], 'dungeon2'),
               enemies: [['goriya','brown',5,5],['goriya','brown',10,5]], exit: { down: true } },
      '3,2': { room: room({ left:'o', up:'o' }, LANE, 'dungeon2'),
               enemies: [['darknut',null,5,4],['keese',null,10,6]],
               item: { kind: 'stepladder', x: 8, y: 5 } },
      '3,1': { room: room({ down:'o', up:'o' }, MOAT, 'dungeon2'),
               enemies: [['zola','blue',7,5],['keese',null,4,3]] },
      '3,0': { room: room({ down:'o', left:'o' }, CORNERS, 'dungeon2', { dark: true }),
               enemies: [['wizzrobe',null,6,4],['keese',null,10,6]],
               item: { kind: 'key', x: 8, y: 5 } },
      '2,0': { room: room({ right:'o', down:'o' }, PILLARS, 'dungeon2'),
               enemies: [['darknut',null,5,4],['darknut',null,10,5]] },
      '2,1': { room: room({ up:'o', left:'l' },
                          ['4,4,W','4,5,W','5,4,W','5,5,W','4,10,W','4,11,W','5,10,W','5,11,W'], 'dungeon2'),
               enemies: [['ironknuckle',null,7,7]],
               item: { kind: 'key', x: 2, y: 2 } },
      '1,1': { room: room({ right:'l', up:'s' }, ['7,4,B','7,11,B'], 'dungeon2', { shutter: 'clear' }),
               enemies: [['darknut',null,5,4],['goriya','blue',10,4],['keese',null,8,7]] },
      '1,0': { room: room({ down:'s' }, [], 'dungeon2'),
               enemies: [], boss: { variant: 'gleeok', x: 11, y: 4, bossOpts: { headHp: 4 } },
               triforce: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 5 — "THE LIZARD" · 7 rooms. Item: silver arrows. Boss: RED DODONGO (3 bombs).
  //   [0,0]item(push) [1,0]dark    [2,0]boss
  //   [0,1]key        [1,1]hub     [2,1]bombs
  //                   [1,2]entry
  const L5 = {
    id: 5, theme: 'dungeon', item: 'silverarrows',
    entry: { col: 1, row: 2, pos: [7, 9] },
    rooms: {
      '1,2': { room: room({ up:'o' }, ['3,4,B','3,11,B'], 'dungeon'),
               enemies: [['goriya','blue',5,5],['goriya','blue',10,5]], exit: { down: true } },
      '1,1': { room: room({ up:'o', down:'o', left:'o', right:'o' }, MOAT, 'dungeon'),
               enemies: [['wizzrobe',null,5,3],['ironknuckle',null,10,7]] },
      '0,1': { room: room({ right:'o', up:'o' }, LANE, 'dungeon'),
               enemies: [['darknut',null,5,4],['darknut',null,10,5],['gel',null,8,3]],
               item: { kind: 'key', x: 8, y: 7 } },
      '0,0': { room: room({ down:'o', right:'s' }, CORNERS, 'dungeon',
                          { shutter: 'push', push: { c: 8, r: 5 } }),
               enemies: [['wizzrobe',null,4,4],['keese',null,11,6]],
               item: { kind: 'silverarrows', x: 12, y: 7 } },
      '1,0': { room: room({ left:'s', down:'o', right:'l' }, [], 'dungeon', { dark: true }),
               enemies: [['ironknuckle',null,5,4],['darknut',null,10,5],['keese',null,8,3]],
               item: { kind: 'key', x: 8, y: 5 } },
      '2,1': { room: room({ up:'o' }, PILLARS, 'dungeon'),
               enemies: [['likelike',null,5,4],['goriya','brown',10,5]],
               item: { kind: 'bomb', x: 8, y: 5 } },
      '2,0': { room: room({ down:'o', left:'l' }, ['2,3,B','2,12,B','8,3,B','8,12,B'], 'dungeon'),
               enemies: [], boss: { variant: 'dodongo', x: 10, y: 4, bossOpts: { pair: true } },
               triforce: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 6 — "THE DRAGON" · 9 rooms, long gauntlet. Item: magic key. Boss: MANHANDLA+.
  //   [0,0]      [1,0]       [2,0]boss
  //   [0,1]dark  [1,1]push   [2,1]moat
  //   [0,2]      [1,2]entry  [2,2]item
  const L6 = {
    id: 6, theme: 'dungeon2', item: 'magickey',
    entry: { col: 1, row: 2, pos: [7, 9] },
    rooms: {
      '1,2': { room: room({ up:'l', left:'o', right:'o' }, [], 'dungeon2'),
               enemies: [['ironknuckle',null,5,5],['ironknuckle',null,10,5]], exit: { down: true } },
      '2,2': { room: room({ left:'o', up:'s' }, LANE, 'dungeon2', { shutter: 'clear' }),
               enemies: [['wizzrobe',null,5,4],['darknut',null,10,5],['keese',null,8,3]],
               item: { kind: 'magickey', x: 8, y: 5 } },
      '0,2': { room: room({ right:'o', up:'o' }, CORNERS, 'dungeon2'),
               enemies: [['likelike',null,5,4],['goriya','blue',10,4]],
               item: { kind: 'key', x: 3, y: 3 } },
      '0,1': { room: room({ down:'o', up:'o' }, MOAT, 'dungeon2', { dark: true }),
               enemies: [['wizzrobe',null,7,3],['keese',null,4,6],['keese',null,11,6]] },
      '0,0': { room: room({ down:'o', right:'o' }, PILLARS, 'dungeon2'),
               enemies: [['darknut',null,5,4],['darknut',null,10,5],['wizzrobe',null,8,7]],
               item: { kind: 'key', x: 8, y: 3 } },
      '1,0': { room: room({ left:'o', right:'s', down:'o' }, ['5,7,B','5,8,B'], 'dungeon2', { shutter: 'clear' }),
               enemies: [['lynel',null,5,4],['ironknuckle',null,10,6],['gel',null,8,3]] },
      '1,1': { room: room({ up:'o', down:'l', right:'o' }, ['3,3,B','3,12,B','7,3,B','7,12,B'], 'dungeon2',
                          { shutter: 'push', push: { c: 7, r: 5 } }),
               enemies: [['darknut',null,4,4],['goriya','blue',11,4]] },
      '2,1': { room: room({ left:'o', up:'o', down:'o' }, MOAT, 'dungeon2'),
               enemies: [['zola','blue',7,5],['wizzrobe',null,10,3]],
               item: { kind: 'bomb', x: 2, y: 8 } },
      '2,0': { room: room({ down:'o', left:'s' }, [], 'dungeon2'),
               enemies: [], boss: { variant: 'manhandla', x: 7, y: 4, bossOpts: { headHp: 3 } },
               triforce: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 7 — "THE DEMON" · 7 rooms. Item: heart container. Boss: blue Aquamentus + adds.
  //   [1,0]key(dark) [2,0]boss  [3,0]item
  //   [1,1]moat      [2,1]hub   [3,1]push
  //                  [2,2]entry
  const L7 = {
    id: 7, theme: 'dungeon', item: 'heartcontainer',
    entry: { col: 2, row: 2, pos: [7, 9] },
    rooms: {
      '2,2': { room: room({ up:'o' }, ['5,4,B','5,11,B','3,7,W','3,8,W'], 'dungeon'),
               enemies: [['darknut',null,5,5],['darknut',null,10,5]], exit: { down: true } },
      '2,1': { room: room({ up:'l', down:'o', left:'o', right:'o' }, PILLARS, 'dungeon'),
               enemies: [['wizzrobe',null,5,4],['lynel',null,10,6],['ironknuckle',null,8,7]] },
      '1,1': { room: room({ right:'o', up:'o' }, MOAT, 'dungeon'),
               enemies: [['zola','blue',7,5],['lynel',null,4,7]] },
      '1,0': { room: room({ down:'o' }, LANE, 'dungeon', { dark: true }),
               enemies: [['wizzrobe',null,5,4],['wizzrobe',null,10,4]],
               item: { kind: 'key', x: 8, y: 5 } },
      '3,1': { room: room({ left:'o', up:'s' }, CORNERS, 'dungeon',
                          { shutter: 'push', push: { c: 8, r: 7 } }),
               enemies: [['darknut',null,5,4],['ironknuckle',null,10,5]] },
      '3,0': { room: room({ down:'s' }, ['5,7,B','5,8,B'], 'dungeon'),
               enemies: [['likelike',null,5,4],['goriya','blue',10,4]],
               item: { kind: 'heartcontainer', x: 8, y: 5 } },
      '2,0': { room: room({ down:'l' }, [], 'dungeon'),
               enemies: [['wizzrobe',null,3,7],['wizzrobe',null,12,7]],
               boss: { variant: 'blue', x: 11, y: 4 }, triforce: { x: 7, y: 3 } },
    },
  };

  // =========================================================================
  // LEVEL 8 — "THE CROWN" · 9 rooms, the gauntlet. Item: heart container. Boss: GLEEOK-3.
  //   [0,0]moat  [1,0]boss   [2,0]key(dark,shutter)
  //   [0,1]dark  [1,1]       [2,1]water maze
  //   [0,2]push  [1,2]entry  [2,2]bombs
  const L8 = {
    id: 8, theme: 'dungeon2', item: 'heartcontainer',
    entry: { col: 1, row: 2, pos: [7, 9] },
    rooms: {
      '1,2': { room: room({ up:'l', left:'o', right:'o' }, [], 'dungeon2'),
               enemies: [['ironknuckle',null,5,5],['ironknuckle',null,10,5]], exit: { down: true } },
      '0,2': { room: room({ right:'o', up:'s' }, CORNERS, 'dungeon2',
                          { shutter: 'push', push: { c: 7, r: 5 } }),
               enemies: [['darknut',null,5,4],['lynel',null,10,4]] },
      '0,1': { room: room({ down:'s', up:'o' }, LANE, 'dungeon2', { dark: true }),
               enemies: [['wizzrobe',null,5,4],['wizzrobe',null,10,4],['keese',null,8,7]],
               item: { kind: 'key', x: 8, y: 5 } },
      '0,0': { room: room({ down:'o', right:'o' }, MOAT, 'dungeon2'),
               enemies: [['zola','blue',7,5],['lynel',null,4,7],['keese',null,11,3]] },
      '2,2': { room: room({ left:'o', up:'o' }, PILLARS, 'dungeon2'),
               enemies: [['goriya','blue',5,4],['darknut',null,10,5]],
               item: { kind: 'bomb', x: 8, y: 3 } },
      '2,1': { room: room({ down:'o', up:'o' }, ['4,4,W','4,5,W','4,10,W','4,11,W','6,4,W','6,5,W','6,10,W','6,11,W'], 'dungeon2'),
               enemies: [['ironknuckle',null,7,5],['wizzrobe',null,3,3]] },
      '2,0': { room: room({ down:'o', left:'s' }, [], 'dungeon2', { dark: true, shutter: 'clear' }),
               enemies: [['darknut',null,5,4],['darknut',null,10,4],['lynel',null,8,7]],
               item: { kind: 'key', x: 8, y: 5 } },
      '1,1': { room: room({ down:'o', up:'l', left:'o' }, ['3,3,B','3,12,B','7,3,B','7,12,B'], 'dungeon2'),
               enemies: [['lynel',null,5,4],['ironknuckle',null,10,6],['wizzrobe',null,8,3]] },
      '1,0': { room: room({ down:'l', right:'s' }, [], 'dungeon2'),
               enemies: [], boss: { variant: 'gleeok', x: 11, y: 4, bossOpts: { headHp: 6, extraFireballs: 2 } },
               triforce: { x: 7, y: 3 } },
    },
  };

  const LEVELS = { 1: L1, 2: L2, 3: L3, 4: L4, 5: L5, 6: L6, 7: L7, 8: L8 };

  function level(n) { return LEVELS[n] || LEVELS[1]; }
  function getRoom(lvl, col, row) { return lvl.rooms[col + ',' + row] || null; }

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

  return { level, getRoom, bounds, count: Object.keys(LEVELS).length };
})();
